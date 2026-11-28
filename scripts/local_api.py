"""Dev-only HTTP server: turns requests into HTTP API v2 events and calls the real Lambda handlers.

Run:  .venv/Scripts/python -m uvicorn --app-dir scripts local_api:app --port 8000
It contains no business logic, so anything that works here works the same on Lambda.
"""
from __future__ import annotations

import importlib
import json
import re
import sys
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from http_events import LocalContext, build_event  # noqa: E402

# (method, path template, handler module). Mirrors the routes in template.yaml.
ROUTES: list[tuple[str, str, str]] = [
    ("GET", "/api/v3/health", "health.handler"),
    ("POST", "/api/v3/ocr", "ocr_api.handler"),
    ("POST", "/api/v3/explain", "explain_api.handler"),
    ("POST", "/api/v3/translate", "translate_api.handler"),
]


def _compile(template: str) -> re.Pattern[str]:
    pattern = re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", template)
    return re.compile(f"^{pattern}$")


_COMPILED = [(m, t, _compile(t), mod) for m, t, mod in ROUTES]

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def _not_found() -> Response:
    body = {"v": 3, "error": {"code": "UNKNOWN_ROUTE", "requestId": str(uuid.uuid4())}}
    return Response(json.dumps(body), status_code=404, media_type="application/json")


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def dispatch(request: Request, rest: str) -> Response:
    path = request.url.path
    for method, template, regex, module in _COMPILED:
        match = regex.match(path)
        if match and request.method == method:
            break
    else:
        return _not_found()

    event = build_event(
        request.method,
        path,
        f"{method} {template}",
        body=await request.body(),
        headers=dict(request.headers),
        query=request.url.query,
        path_params=match.groupdict() or None,
        source_ip=request.client.host if request.client else "127.0.0.1",
    )
    handler = importlib.import_module(module).handler
    result = await run_in_threadpool(handler, event, LocalContext())
    return Response(
        content=result.get("body", ""),
        status_code=result["statusCode"],
        headers=result.get("headers", {}),
    )
