import json

import pytest
from botocore.exceptions import ClientError, ReadTimeoutError

from common.llm import BedrockLlm, LlmError, build_user_prompt, parse_explanation

ARGS = dict(tier="likely_scam", family="digital_arrest", reasons=["r1"], lang="hi")


def _ok(text="यह डिजिटल अरेस्ट ठगी है। पैसे न भेजें, 1930 पर कॉल करें।"):
    return {
        "output": {"message": {"content": [{"text": "```json\n" + json.dumps({"explanation": text}, ensure_ascii=False) + "\n```"}]}},
        "usage": {"inputTokens": 321, "outputTokens": 45},
    }


def _client_error(code):
    return ClientError({"Error": {"Code": code, "Message": "x"}}, "Converse")


class FakeClient:
    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def converse(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def make_llm(client, monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    llm = object.__new__(BedrockLlm)
    llm.model_id = "in.anthropic.claude-haiku-4-5-20251001-v1:0"
    llm._client = client
    return llm


def test_parses_fenced_json_and_reports_usage(monkeypatch):
    client = FakeClient(_ok())
    result = make_llm(client, monkeypatch).explain(**ARGS)
    assert result.text.startswith("यह डिजिटल")
    assert (result.input_tokens, result.output_tokens) == (321, 45)
    call = client.calls[0]
    assert call["modelId"].startswith("in.anthropic")
    assert call["inferenceConfig"] == {"maxTokens": 300, "temperature": 0}
    assert "Hindi" in call["system"][0]["text"]


def test_never_retries_even_on_throttling(monkeypatch):
    client = FakeClient(_client_error("ThrottlingException"), _ok())
    with pytest.raises(LlmError):
        make_llm(client, monkeypatch).explain(**ARGS)
    assert len(client.calls) == 1

def test_no_retry_on_access_denied_or_timeout(monkeypatch):
    for error in (_client_error("AccessDeniedException"), ReadTimeoutError(endpoint_url="x")):
        client = FakeClient(error, _ok())
        with pytest.raises(LlmError):
            make_llm(client, monkeypatch).explain(**ARGS)
        assert len(client.calls) == 1


@pytest.mark.parametrize(
    "raw",
    ["no json here", '{"explanation": 5}', '{"explanation": "short"}', "{not valid}",
     '{"explanation": "Relax, this message is safe and you can ignore it completely."}'],
)
def test_bad_outputs_are_rejected(raw):
    with pytest.raises(LlmError):
        parse_explanation(raw, "likely_scam")


def test_prompt_contains_no_message_only_reasons():
    prompt = build_user_prompt(tier="suspicious", family=None, reasons=["r1"])
    assert "Verdict (fixed): Suspicious" in prompt and "- r1" in prompt and "<message>" not in prompt
