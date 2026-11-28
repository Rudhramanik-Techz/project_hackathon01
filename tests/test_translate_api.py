"""POST /api/v3/translate: the person's story -> English, with consent in the app, a daily cap and no logging."""
import pytest

from common import translate
from translate_api.handler import handler

STORY = "एक आदमी ने खुद को बैंक का अफसर बताया और मुझसे पैसे भिजवाए।"


@pytest.fixture(autouse=True)
def mock_translate(monkeypatch):
    monkeypatch.setenv("TRANSLATE_PROVIDER", "mock")


def post(call, body, headers=None):
    return call(handler, "POST", "/api/v3/translate", json_body=body, headers=headers)


def test_translates_with_mock(call):
    status, body, headers = post(call, {"text": STORY})
    assert status == 200 and body["v"] == 3
    assert body["text"].startswith("[mock English]") and body["sourceLang"] == "hi"
    assert headers["cache-control"] == "no-store"


@pytest.mark.parametrize("body", [
    {},
    {"text": ""},
    {"text": "   "},
    {"text": 5},
    {"text": STORY, "lang": "hi"},  # only the text is accepted
    {"text": "क" * 1001},
])
def test_rejects_anything_but_one_short_text(call, body):
    status, out, _ = post(call, body)
    assert (status, out["error"]["code"]) == (400, "INVALID_REQUEST")


def test_exactly_1000_characters_is_allowed(call):
    assert post(call, {"text": "क" * 1000})[0] == 200


def test_cross_site_browser_call_is_refused(call):
    status, out, _ = post(call, {"text": STORY}, {"origin": "https://evil.example", "sec-fetch-site": "cross-site"})
    assert (status, out["error"]["code"]) == (400, "INVALID_REQUEST")


def test_off_means_unavailable(call, monkeypatch):
    monkeypatch.setenv("TRANSLATE_PROVIDER", "off")
    status, out, _ = post(call, {"text": STORY})
    assert (status, out["error"]["code"]) == (503, "TEMPORARILY_UNAVAILABLE")


def test_daily_cap(call, monkeypatch):
    monkeypatch.setenv("TRANSLATE_DAILY_CAP", "2")
    assert [post(call, {"text": STORY})[0] for _ in range(3)] == [200, 200, 503]
    assert post(call, {"text": STORY})[1]["error"]["code"] == "DAILY_LIMIT"


def test_provider_failure_is_unavailable(call, monkeypatch):
    def broken(self, text, source):
        raise translate.TranslateError("ThrottlingException")

    monkeypatch.setattr(translate.MockTranslator, "to_english", broken)
    status, out, _ = post(call, {"text": STORY})
    assert (status, out["error"]["code"]) == (503, "TEMPORARILY_UNAVAILABLE")


def test_story_text_is_never_logged(call, capsys):
    post(call, {"text": STORY})
    logged = capsys.readouterr()
    assert "बैंक" not in logged.out + logged.err and "mock English" not in logged.out + logged.err
