"""Structured JSON logging that can never write user content.

One line per request. Any key in REDACTED_KEYS is dropped at every nesting level,
so a careless `log_event(body=payload)` still can't leak message text or payment fields.
"""
from __future__ import annotations

import json
import sys
from typing import Any

REDACTED_KEYS = frozenset({"text", "images", "notes", "amount", "utr", "vpa"})


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: redact(v)
            for k, v in value.items()
            if not (isinstance(k, str) and k.lower() in REDACTED_KEYS)
        }
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    return value


def log_event(**fields: Any) -> None:
    line = json.dumps(redact(fields), ensure_ascii=False, default=str, separators=(",", ":"))
    sys.stdout.write(line + "\n")
    sys.stdout.flush()
