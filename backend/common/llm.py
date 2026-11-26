"""LLM adapter: LLM_PROVIDER=off | mock | bedrock. It only rewrites reviewed reasons into friendlier text.

v3 option B: the model never receives the user's message. It gets the fixed verdict, the scam family and the
reviewed English reasons of the matched rules. One attempt, no retries (no automatic paid retry anywhere).
Any failure raises LlmError and the browser keeps its template explanation.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Protocol

from common import config

LANGUAGE_NAMES = {
    "en": "simple English",
    "hi": "simple Hindi in Devanagari script",
    "ta": "simple Tamil in Tamil script",
}

SYSTEM_PROMPT = (
    "You explain scam warnings to worried Indian families, many of them elderly. "
    "A rules engine has already decided the verdict. Do not change it, soften it, or say the message is safe. "
    "You do not see the message itself, only the warning signs the rules found. Do not invent names, amounts, "
    "links or phone numbers; the only number you may mention is 1930. "
    "Write 2 or 3 short, plain sentences in {language} explaining the warning signs you are given. "
    "End with one clear action: do not pay or share any OTP or PIN, and call 1930 if money was already sent. "
    'Reply with JSON only, exactly: {{"explanation": "..."}}'
)

TIER_WORDS = {
    "likely_scam": "Likely scam",
    "suspicious": "Suspicious",
    "no_known_pattern": "No known scam pattern found",
}

# Phrases an explanation must never contain when the rules flagged the message.
_SOFTENING = re.compile(r"\b(not a scam|is safe|looks safe|seems safe|is genuine|looks genuine|is legitimate)\b", re.I)



class LlmError(Exception):
    pass


@dataclass(frozen=True)
class LlmResult:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0


class Llm(Protocol):
    def explain(self, *, tier: str, family: str | None, reasons: list[str], lang: str) -> LlmResult: ...


def build_user_prompt(*, tier: str, family: str | None, reasons: list[str]) -> str:
    bullet_reasons = "\n".join(f"- {r}" for r in reasons) or "- (none)"
    return (
        f"Verdict (fixed): {TIER_WORDS.get(tier, tier)}\n"
        f"Scam family: {family or 'unknown'}\n"
        f"Warning signs found:\n{bullet_reasons}"
    )


def parse_explanation(raw: str, tier: str) -> str:
    match = re.search(r"\{.*\}", raw, re.S)
    if not match:
        raise LlmError("no JSON object in model output")
    try:
        data = json.loads(match.group(0))
    except ValueError as exc:
        raise LlmError("invalid JSON from model") from exc
    text = data.get("explanation") if isinstance(data, dict) else None
    if not isinstance(text, str):
        raise LlmError("missing explanation")
    text = " ".join(text.split())
    if not 20 <= len(text) <= 800:
        raise LlmError("explanation length out of range")
    if tier != "no_known_pattern" and _SOFTENING.search(text):
        raise LlmError("explanation contradicts the verdict")
    return text


class MockLlm:
    """Deterministic stand-in. Set MOCK_LLM_FAIL=1 to exercise the template fallback."""

    def explain(self, *, tier: str, family: str | None, reasons: list[str], lang: str) -> LlmResult:
        import os

        if os.environ.get("MOCK_LLM_FAIL") == "1":
            raise LlmError("mock failure requested")
        raw = json.dumps(
            {"explanation": f"[mock {lang}] {TIER_WORDS[tier]}: {len(reasons)} warning sign(s) found. Do not pay; call 1930 if money was sent."}
        )
        return LlmResult(parse_explanation(raw, tier), input_tokens=0, output_tokens=0)


class BedrockLlm:
    ATTEMPT_TIMEOUT_S = 4
    MAX_OUTPUT_TOKENS = 300

    def __init__(self, model_id: str) -> None:
        import boto3
        from botocore.config import Config

        self.model_id = model_id
        self._client = boto3.client(
            "bedrock-runtime",
            region_name=config.aws_region(),
            config=Config(
                connect_timeout=2,
                read_timeout=self.ATTEMPT_TIMEOUT_S,
                retries={"total_max_attempts": 1},  # we retry once ourselves, with jitter
            ),
        )

    def _converse(self, system: str, prompt: str) -> dict:
        return self._client.converse(
            modelId=self.model_id,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": self.MAX_OUTPUT_TOKENS, "temperature": 0},
        )

    def explain(self, *, tier: str, family: str | None, reasons: list[str], lang: str) -> LlmResult:
        from botocore.exceptions import BotoCoreError, ClientError

        system = SYSTEM_PROMPT.format(language=LANGUAGE_NAMES.get(lang, LANGUAGE_NAMES["en"]))
        prompt = build_user_prompt(tier=tier, family=family, reasons=reasons)
        try:  # exactly one attempt: v3 forbids automatic paid retries
            response = self._converse(system, prompt)
        except ClientError as exc:
            raise LlmError(f"bedrock error {exc.response.get('Error', {}).get('Code', '')}") from exc
        except BotoCoreError as exc:
            raise LlmError(f"bedrock transport error {type(exc).__name__}") from exc

        try:
            text = response["output"]["message"]["content"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LlmError("unexpected bedrock response shape") from exc
        usage = response.get("usage", {})
        return LlmResult(
            parse_explanation(text, tier),
            input_tokens=int(usage.get("inputTokens", 0)),
            output_tokens=int(usage.get("outputTokens", 0)),
        )


_llm: Llm | None = None
_llm_key: tuple[str, str] | None = None


def get_llm() -> Llm:
    """One client per warm container; rebuilt if the provider settings change (tests, local switching)."""
    global _llm, _llm_key
    key = (config.llm_provider(), config.bedrock_model_id())
    if _llm is None or key != _llm_key:
        if key[0] in ("mock", "off"):
            _llm = MockLlm()
        elif key[0] == "bedrock":
            _llm = BedrockLlm(key[1])
        else:
            raise RuntimeError(f"Unknown LLM_PROVIDER={key[0]!r}")
        _llm_key = key
    return _llm
