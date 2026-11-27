"""POST /api/v3/translate: the person's own "what happened" text -> English for the cybercrime.gov.in complaint.

Input is exactly {"text": "..."} (1-1000 characters), sent only after the person ticks consent in the app.
The text goes to Amazon Translate in Mumbai once and is never stored or logged. The person reviews and edits
the English before it is used. Daily cap in the ledger; off, capped or failing -> 503 and the original stays.
"""
from __future__ import annotations

import time

from common import config
from common.errors import daily_limit, invalid_request, unavailable
from common.http import Request, api_handler, browser_origin_ok
from common.ledger import get_ledger
from common.log import log_event
from common.translate import TranslateError, get_translator

ROUTE = "POST /api/v3/translate"
MAX_CHARS = 1000  # same limit as the story box
MAX_BODY = 8 * 1024


@api_handler(ROUTE)
def handler(req: Request) -> tuple[int, dict]:
    if req.has_query or not browser_origin_ok(req):
        raise invalid_request()
    if (req.header("content-type") or "").split(";")[0].strip().lower() != "application/json":
        raise invalid_request()
    body = req.json_body(MAX_BODY)
    if not isinstance(body, dict) or set(body) != {"text"} or not isinstance(body["text"], str):
        raise invalid_request()
    text = body["text"].strip()
    if not text or len(text) > MAX_CHARS:  # Python counts Unicode characters, like the story box
        raise invalid_request()

    if config.translate_provider() == "off":
        raise unavailable()
    with req.tracer.stage("admission"):
        if not get_ledger().translate_admit(time.time()):
            raise daily_limit()
    try:
        with req.tracer.stage("provider"):
            result = get_translator().to_english(text, "auto")
    except TranslateError as exc:
        log_event(level="warn", requestId=req.request_id, route=ROUTE, providerError=str(exc)[:64])
        raise unavailable() from None
    english = result.text.strip()
    if not english or len(english) > 4 * MAX_CHARS:
        raise unavailable()
    return 200, {"v": 3, "requestId": req.request_id, "text": english, "sourceLang": result.source[:8]}
