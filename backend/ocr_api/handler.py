"""POST /api/v3/ocr: one consented JPEG -> ranked, source-linked field candidates.

validate -> admit once in the ledger -> Textract exactly once (4.5 s) -> candidates + boxes + timings.
The image lives only in this invocation's memory. Nothing extracted is stored or logged.
"""
from __future__ import annotations

import json
import time

from common import config
from common.errors import (ApiError, image_too_large, invalid_image, invalid_request, ocr_deadline,
                           unavailable, unsupported_media)
from common.http import Request, api_handler, single_uuid_header
from common.jpeg import jpeg_size
from common.ledger import get_ledger
from common.log import log_event
from common.ocr import PROVIDER_DEADLINE_S, OcrDeadline, OcrError, get_ocr
from golden_hour.parsers import extract

ROUTE = "POST /api/v3/ocr"
MAX_BYTES = 1_200_000
MAX_EDGE = 1600
MAX_PIXELS = 2_560_000
MAX_RESPONSE_BYTES = 32_768


def _serialize(body: dict) -> dict:
    """Keep the compact UTF-8 response under 32 KiB by dropping whole lowest-ranked candidates."""
    while len(json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()) > MAX_RESPONSE_BYTES:
        if not body["candidates"]:
            break
        body["candidates"] = body["candidates"][:-1]
        if "truncated_candidates" not in body["warnings"]:
            body["warnings"].append("truncated_candidates")
    return body


@api_handler(ROUTE)
def handler(req: Request) -> tuple[int, dict]:
    with req.tracer.stage("validate"):
        if req.has_query:
            raise invalid_request()
        content_type = (req.header("content-type") or "").strip().lower()
        if content_type != "image/jpeg":
            raise unsupported_media()
        if (req.header("content-encoding") or "identity").lower() != "identity":
            raise unsupported_media()
        key = single_uuid_header(req, "idempotency-key")
        image_id = single_uuid_header(req, "x-image-id")
        data = req.raw_body(MAX_BYTES)
        if len(data) > MAX_BYTES:
            raise image_too_large()
        size = jpeg_size(data)
        if size is None:
            raise invalid_image()
        width, height = size
        if max(width, height) > MAX_EDGE or width * height > MAX_PIXELS:
            raise image_too_large()

    now = time.time()  # trusted server time, sampled once
    with req.tracer.stage("admission"):
        admission = get_ledger().admit(key, now)

    # Admitted: exactly one provider attempt. No retry on any outcome.
    dispatched = time.monotonic()
    try:
        with req.tracer.stage("provider"):
            lines = get_ocr().read(data)
    except OcrDeadline:
        raise ocr_deadline() from None
    except OcrError as exc:
        log_event(level="warn", requestId=req.request_id, route=ROUTE, providerError=str(exc)[:64])
        raise unavailable() from None
    if time.monotonic() - dispatched >= PROVIDER_DEADLINE_S:
        raise ocr_deadline()  # a result at or after the cutoff is late, even if valid

    with req.tracer.stage("parse"):
        result = extract(lines)

    stages = req.tracer.stages
    body = {
        "v": 3,
        "requestId": req.request_id,
        "imageId": image_id,
        "attemptId": key,
        "outcome": "candidates" if result.candidates else "no_fields",
        "candidates": [c.to_dict() for c in result.candidates],
        "warnings": result.warnings,
        "timingsMs": {"admission": stages.get("admission", 0), "provider": stages.get("provider", 0),
                      "total": req.tracer.total_ms()},
        "region": config.region_label(),
        "build": config.build_id(),
        "usedToday": admission.used_today,
        "dailyCap": config.ocr_daily_cap(),
    }
    return 200, _serialize(body)


__all__ = ["handler", "ApiError"]
