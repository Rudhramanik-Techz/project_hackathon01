from __future__ import annotations

import json
import uuid

import pytest

from common import ledger
from http_events import LocalContext, build_event


@pytest.fixture(autouse=True)
def memory_env(monkeypatch: pytest.MonkeyPatch):
    """Every test starts with a fresh in-memory ledger (OCR enabled) and mock providers."""
    monkeypatch.setenv("STORE", "memory")
    monkeypatch.setenv("OCR_PROVIDER", "mock")
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    ledger.reset_for_tests()
    yield
    ledger.reset_for_tests()


def new_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def call():
    """call(handler, method, path, json_body=..., raw_body=..., headers=...) -> (status, body, headers)."""

    def _call(handler, method: str, path: str, *, json_body=None, raw_body: bytes | None = None,
              headers: dict | None = None, query: str = ""):
        body = raw_body if raw_body is not None else (
            json.dumps(json_body).encode() if json_body is not None else b"")
        hdrs = {"content-type": "application/json", **(headers or {})}
        event = build_event(method, path, f"{method} {path}", body=body, headers=hdrs, query=query)
        result = handler(event, LocalContext())
        return result["statusCode"], json.loads(result["body"]), result["headers"]

    return _call
