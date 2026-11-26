"""GET /api/v3/health: handler liveness, build and region only. No table, no AI, no paid probe."""
from __future__ import annotations

from common import config
from common.errors import invalid_request
from common.http import Request, api_handler


@api_handler("GET /api/v3/health")
def handler(req: Request) -> tuple[int, dict]:
    if req.has_query or req.event.get("body"):
        raise invalid_request()
    return 200, {"v": 3, "build": config.build_id(), "status": "ok", "region": config.region_label()}
