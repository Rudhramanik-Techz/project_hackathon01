"""Builds API Gateway HTTP API payload v2 events. Used by local_api.py and the tests (dev only)."""
from __future__ import annotations

import base64
import time
import uuid
from dataclasses import dataclass, field

TEXT_TYPES = ("application/json", "text/", "application/x-www-form-urlencoded")


def build_event(
    method: str,
    path: str,
    route_key: str,
    *,
    body: bytes = b"",
    headers: dict[str, str] | None = None,
    query: str = "",
    path_params: dict[str, str] | None = None,
    source_ip: str = "127.0.0.1",
) -> dict:
    headers = {k.lower(): v for k, v in (headers or {}).items()}
    content_type = headers.get("content-type", "")
    is_text = not body or any(content_type.startswith(t) for t in TEXT_TYPES)
    if is_text:
        try:
            body_str, is_b64 = body.decode("utf-8"), False
        except UnicodeDecodeError:
            body_str, is_b64 = base64.b64encode(body).decode(), True
    else:
        body_str, is_b64 = base64.b64encode(body).decode(), True

    now = time.time()
    event: dict = {
        "version": "2.0",
        "routeKey": route_key,
        "rawPath": path,
        "rawQueryString": query,
        "headers": headers,
        "requestContext": {
            "accountId": "local",
            "apiId": "local",
            "domainName": headers.get("host", "localhost"),
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": source_ip,
                "userAgent": headers.get("user-agent", ""),
            },
            "requestId": uuid.uuid4().hex,
            "routeKey": route_key,
            "stage": "$default",
            "time": time.strftime("%d/%b/%Y:%H:%M:%S +0000", time.gmtime(now)),
            "timeEpoch": int(now * 1000),
        },
        "isBase64Encoded": is_b64,
    }
    if body:
        event["body"] = body_str
    if path_params:
        event["pathParameters"] = path_params
    return event


@dataclass
class LocalContext:
    """Just the Lambda context attributes our handlers read."""

    function_name: str = "local"
    aws_request_id: str = field(default_factory=lambda: uuid.uuid4().hex)

    def get_remaining_time_in_millis(self) -> int:
        return 15_000
