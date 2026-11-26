import json

import pytest

from common import llm
from common.rules import engine
from explain_api.handler import handler as explain
from health.handler import handler as health

OK = {"lang": "hi", "tier": "likely_scam", "family": "digital_arrest", "ruleIds": ["DA-01", "DA-03", "CB-01"]}


def test_health_v3(call):
    status, body, headers = call(health, "GET", "/api/v3/health")
    assert status == 200 and body == {"v": 3, "build": "dev", "status": "ok", "region": "local"}
    assert headers["cache-control"] == "no-store"


def test_health_rejects_query(call):
    assert call(health, "GET", "/api/v3/health", query="x=1")[0] == 400


def test_explain_mock(call):
    status, body, _ = call(explain, "POST", "/api/v3/explain", json_body=OK)
    assert status == 200 and body["v"] == 3 and body["explanation"].startswith("[mock hi]")


def test_model_receives_only_reviewed_reasons(call, monkeypatch):
    seen = {}

    def spy(self, **kwargs):
        seen.update(kwargs)
        return llm.LlmResult("This is a digital arrest scam. Do not pay; call 1930 if money was sent.")

    monkeypatch.setattr(llm.MockLlm, "explain", spy)
    call(explain, "POST", "/api/v3/explain", json_body=OK)
    assert set(seen) == {"tier", "family", "reasons", "lang"}
    known = {r.id: r.reason["en"] for r in engine().rules} | {c.id: c.reason["en"] for c in engine().combos}
    assert seen["reasons"] == [known[i] for i in OK["ruleIds"]]


@pytest.mark.parametrize("bad", [
    {**OK, "text": "the user's message"},          # free text is never accepted
    {**OK, "ruleIds": ["NOT-A-RULE"]},
    {**OK, "ruleIds": []},
    {**OK, "tier": "no_known_pattern"},
    {**OK, "lang": "fr"},
    {**OK, "family": "lottery"},
])
def test_explain_rejects_anything_but_rule_ids(call, bad):
    status, body, _ = call(explain, "POST", "/api/v3/explain", json_body=bad)
    assert status == 400 and body == {"v": 3, "error": {"code": "INVALID_REQUEST", "requestId": body["error"]["requestId"]}}


def test_explain_off_or_capped_or_failing_is_503(call, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "off")
    assert call(explain, "POST", "/api/v3/explain", json_body=OK)[0] == 503
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("LLM_DAILY_CAP", "1")
    assert call(explain, "POST", "/api/v3/explain", json_body=OK)[0] == 200
    assert call(explain, "POST", "/api/v3/explain", json_body=OK)[0] == 503
    monkeypatch.setenv("LLM_DAILY_CAP", "100")
    monkeypatch.setenv("MOCK_LLM_FAIL", "1")
    assert call(explain, "POST", "/api/v3/explain", json_body=OK)[0] == 503


def test_explain_body_size_limit(call):
    raw = json.dumps({**OK, "pad": "x" * 5000}).encode()
    assert call(explain, "POST", "/api/v3/explain", raw_body=raw)[0] == 400
