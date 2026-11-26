"""API Gateway HTTP API (payload v2) plumbing shared by every handler.

`api_handler` wraps a route so every response gets the same headers, the v3 error envelope, a fresh
server request ID and exactly one redacted log line.
"""
from __future__ import annotations

import base64
import binascii
import functools
import json
import re
import uuid
from dataclasses import dataclass
from typing import Any, Callable

from common.errors import ApiError, envelope, invalid_request
from common.log import log_event
from common.trace import Tracer

BASE_HEADERS = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
}

UUID4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


@dataclass
class Request:
    event: dict
    request_id: str
    tracer: Tracer

    def header(self, name: str) -> str | None:
        headers = self.event.get("headers") or {}
        for key, value in headers.items():
            if key.lower() == name:
                return value
        return None

    @property
    def has_query(self) -> bool:
        return bool(self.event.get("rawQueryString") or self.event.get("queryStringParameters"))

    def raw_body(self, max_bytes: int) -> bytes:
        """Decodes the body; returns max_bytes + 1 bytes at most so callers can detect 'too large'."""
        body = self.event.get("body") or ""
        if self.event.get("isBase64Encoded"):
            if len(body) > (max_bytes + 3) * 4 // 3 + 4:
                return b"\0" * (max_bytes + 1)
            try:
                return base64.b64decode(body, validate=True)
            except (binascii.Error, ValueError):
                raise invalid_request() from None
        data = body.encode("utf-8")
        return data[: max_bytes + 1]

    def json_body(self, max_bytes: int) -> Any:
        data = self.raw_body(max_bytes)
        if len(data) > max_bytes:
            raise invalid_request()
        try:
            return json.loads(data)
        except (ValueError, UnicodeDecodeError):
            raise invalid_request() from None


def single_uuid_header(req: Request, name: str) -> str:
    """Exactly one canonical lowercase UUIDv4. Gateway folds duplicate headers with commas: reject those."""
    value = req.header(name)
    if value is None or "," in value or not UUID4.match(value):
        raise invalid_request()
    return value


def _response(status: int, payload: dict, request_id: str, extra: dict[str, str] | None = None) -> dict:
    return {
        "statusCode": status,
        "headers": {**BASE_HEADERS, "x-request-id": request_id, **(extra or {})},
        "body": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    }


RouteFn = Callable[[Request], tuple[int, dict]]


def api_handler(route: str) -> Callable[[RouteFn], Callable[[dict, Any], dict]]:
    def decorate(fn: RouteFn) -> Callable[[dict, Any], dict]:
        @functools.wraps(fn)
        def handler(event: dict, context: Any) -> dict:
            request_id = str(uuid.uuid4())  # server-generated; never the client's key
            tracer = Tracer()
            error_code: str | None = None
            try:
                status, payload = fn(Request(event, request_id, tracer))
                response = _response(status, payload, request_id)
            except ApiError as err:
                status, error_code = err.status, err.code
                response = _response(status, envelope(err.code, request_id), request_id, err.headers)
            except Exception as err:  # never leak a stack trace or message
                status, error_code = 500, "INTERNAL"
                log_event(level="error", requestId=request_id, route=route, errorType=type(err).__name__)
                response = _response(500, envelope("INTERNAL", request_id), request_id)
            log_event(level="info", requestId=request_id, route=route, status=status, errorCode=error_code,
                      stages=tracer.stages, totalMs=tracer.total_ms())
            return response

        return handler

    return decorate
