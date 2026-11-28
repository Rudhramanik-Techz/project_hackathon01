"""Optional story translation for the complaint: Amazon Translate in Mumbai, one attempt, short deadline.

Only the text the person chose to translate is sent; nothing is stored or logged. The person reviews and
edits the English before it is used, so a machine translation never becomes a fact on its own.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from common import config

DEADLINE_S = 4.0


@dataclass(frozen=True)
class Translation:
    text: str
    source: str  # detected or given language code, e.g. "hi"


class TranslateError(Exception):
    pass


class Translator(Protocol):
    def to_english(self, text: str, source: str) -> Translation: ...


class MockTranslator:
    """Local development and tests: clearly marked, never mistaken for a real translation."""

    def to_english(self, text: str, source: str) -> Translation:
        return Translation(f"[mock English] {text}", "hi" if source == "auto" else source)


class AwsTranslator:
    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        self._client = boto3.client(
            "translate",
            region_name=config.aws_region(),
            config=Config(connect_timeout=1, read_timeout=DEADLINE_S, retries={"total_max_attempts": 1}),
        )

    def to_english(self, text: str, source: str) -> Translation:
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            r = self._client.translate_text(Text=text, SourceLanguageCode=source, TargetLanguageCode="en")
        except ClientError as exc:
            raise TranslateError(exc.response.get("Error", {}).get("Code", "error")) from exc
        except BotoCoreError as exc:
            raise TranslateError(type(exc).__name__) from exc
        return Translation(str(r.get("TranslatedText", "")), str(r.get("SourceLanguageCode", source)))


_translator: Translator | None = None
_kind: str | None = None


def get_translator() -> Translator:
    global _translator, _kind
    kind = config.translate_provider()
    if _translator is None or _kind != kind:
        _translator = AwsTranslator() if kind == "aws" else MockTranslator()
        _kind = kind
    return _translator
