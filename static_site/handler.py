"""Interim static-site Lambda: serves the built frontend from API Gateway while CloudFront is unavailable.

Same HTTPS origin as /api/v3/*, so no CORS. Security headers match the CloudFront policy. A missing asset is a
real 404 (never the HTML shell), and /api/* paths that reach here get the v3 JSON 404 envelope.
Package layout: static_site/handler.py + static_site/dist/ (copied from frontend/dist by scripts/deploy.sh).
"""
from __future__ import annotations

import base64
import gzip
import json
import uuid
from functools import lru_cache
from pathlib import Path

ROOT = (Path(__file__).resolve().parent / "dist").resolve()

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
}
COMPRESSIBLE = (".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".md", ".txt")
NO_CACHE = {"index.html", "sw.js", "registerSW.js", "manifest.webmanifest"}

SECURITY = {
    "content-security-policy": (
        "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self'; "
        "style-src 'self' 'unsafe-inline'; worker-src 'self'; manifest-src 'self'; object-src 'none'; "
        "base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    ),
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
}


@lru_cache(maxsize=128)
def _read(path: str) -> bytes:
    return Path(path).read_bytes()


def _response(status: int, body: bytes, content_type: str, cache: str, gzip_ok: bool, name: str) -> dict:
    headers = {**SECURITY, "content-type": content_type, "cache-control": cache}
    if gzip_ok and name.endswith(COMPRESSIBLE) and len(body) > 1024:
        body = gzip.compress(body, compresslevel=6)
        headers["content-encoding"] = "gzip"
        headers["vary"] = "accept-encoding"
    return {"statusCode": status, "headers": headers, "body": base64.b64encode(body).decode(), "isBase64Encoded": True}


def handler(event: dict, context: object) -> dict:
    path = event.get("rawPath") or "/"
    if path.startswith("/api/"):
        body = json.dumps({"v": 3, "error": {"code": "UNKNOWN_ROUTE", "requestId": str(uuid.uuid4())}}).encode()
        return {"statusCode": 404, "headers": {**SECURITY, "content-type": "application/json", "cache-control": "no-store"},
                "body": body.decode(), "isBase64Encoded": False}

    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    gzip_ok = "gzip" in headers.get("accept-encoding", "")
    rel = path.lstrip("/") or "index.html"
    target = (ROOT / rel).resolve()
    inside = target == ROOT or ROOT in target.parents
    if not inside or not target.is_file():
        if "." in Path(rel).name:  # a missing file is a real 404, never the HTML shell
            return _response(404, b"Not found", "text/plain; charset=utf-8", "no-store", False, "404.txt")
        target = ROOT / "index.html"  # document routes fall back to the app shell
    name = target.name
    cache = "no-cache" if name in NO_CACHE else (
        "public, max-age=31536000, immutable" if "/assets/" in target.as_posix() else "public, max-age=86400")
    return _response(200, _read(str(target)), TYPES.get(target.suffix.lower(), "application/octet-stream"),
                     cache, gzip_ok, name)
