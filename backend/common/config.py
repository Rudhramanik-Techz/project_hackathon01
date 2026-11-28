"""All environment-driven settings in one place. Same names locally and on Lambda."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

# IST has no DST, so a fixed offset is exact and avoids needing tzdata on Windows/Lambda.
IST = timezone(timedelta(hours=5, minutes=30), "IST")

DEFAULT_MODEL_ID = "in.anthropic.claude-haiku-4-5-20251001-v1:0"


def _env(name: str, default: str) -> str:
    value = os.environ.get(name, "").strip()
    return value or default


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def on_lambda() -> bool:
    return "AWS_LAMBDA_FUNCTION_NAME" in os.environ


def region_label() -> str:
    """What the UI shows: the real region on AWS, 'local' on a laptop."""
    return _env("AWS_REGION", "ap-south-1") if on_lambda() else "local"


def aws_region() -> str:
    """Region boto3 clients use (also from a laptop with OCR/LLM set to real providers)."""
    return _env("AWS_REGION", "ap-south-1")


def store_kind() -> str:
    return _env("STORE", "memory")


def ocr_provider() -> str:
    return _env("OCR_PROVIDER", "mock")


def llm_provider() -> str:
    """off | mock | bedrock. off (default on AWS until the quota is approved) makes /api/v3/explain return 503."""
    return _env("LLM_PROVIDER", "mock")


def bedrock_model_id() -> str:
    return _env("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID)


def allowed_origins() -> set[str]:
    """Extra browser origins allowed to call paid routes (e.g. the CloudFront domain), comma-separated."""
    return {o.strip().lower().rstrip('/') for o in _env('ALLOWED_ORIGINS', '').split(',') if o.strip()}


def table_name() -> str:
    return _env("TABLE_NAME", "asli-ledger")


def ocr_enabled_locally() -> bool:
    """Memory ledger only: the local kill switch. On AWS the POLICY#OCR row decides."""
    return _env("OCR_ENABLED", "1") not in {"0", "false", "no"}


def build_id() -> str:
    return _env("BUILD_ID", "dev")


def llm_daily_cap() -> int:
    return _env_int("LLM_DAILY_CAP", 100)


def translate_daily_cap() -> int:
    return _env_int("TRANSLATE_DAILY_CAP", 300)


def translate_provider() -> str:
    """off | mock | aws. mock (local default) returns a marked fake translation; AWS uses Amazon Translate."""
    return _env("TRANSLATE_PROVIDER", "mock")


def ocr_daily_cap() -> int:
    return _env_int("OCR_DAILY_CAP", 150)


def now_ist() -> datetime:
    return datetime.now(IST)
