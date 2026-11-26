"""POST /api/v3/explain: optional, privacy-safe AI explanation of a checker verdict (Bedrock, option B).

Input is ONLY {lang, tier, family, ruleIds}. Rule IDs must exist in the shipped rules; no free text is
accepted, so the user's message can never reach the model. The browser has already shown the template
explanation; this only offers friendlier wording. Off, capped or failing -> 503 and the template stays.
"""
from __future__ import annotations

import time

from common import config
from common.errors import invalid_request, unavailable
from common.http import Request, api_handler
from common.ledger import get_ledger
from common.llm import LlmError, get_llm
from common.log import log_event
from common.rules import FAMILIES, engine

ROUTE = "POST /api/v3/explain"
TIERS = {"likely_scam", "suspicious"}


@api_handler(ROUTE)
def handler(req: Request) -> tuple[int, dict]:
    body = req.json_body(2048)
    if not isinstance(body, dict) or set(body) - {"lang", "tier", "family", "ruleIds"}:
        raise invalid_request()
    lang, tier, family, rule_ids = body.get("lang"), body.get("tier"), body.get("family"), body.get("ruleIds")
    if lang not in {"en", "hi", "ta"} or tier not in TIERS or (family is not None and family not in FAMILIES):
        raise invalid_request()
    known = {r.id: r for r in engine().rules} | {c.id: c for c in engine().combos}
    if (not isinstance(rule_ids, list) or not 1 <= len(rule_ids) <= 12
            or any(not isinstance(r, str) or r not in known for r in rule_ids)):
        raise invalid_request()

    if config.llm_provider() == "off":
        raise unavailable()
    with req.tracer.stage("admission"):
        if not get_ledger().llm_admit(time.time()):
            raise unavailable()
    try:
        with req.tracer.stage("model"):
            result = get_llm().explain(tier=tier, family=family,
                                       reasons=[known[r].reason["en"] for r in dict.fromkeys(rule_ids)], lang=lang)
    except LlmError as exc:
        log_event(level="warn", requestId=req.request_id, route=ROUTE, llmError=str(exc)[:64])
        raise unavailable() from None
    return 200, {"v": 3, "requestId": req.request_id, "explanation": result.text,
                 "model": "mock" if config.llm_provider() == "mock" else config.bedrock_model_id()}
