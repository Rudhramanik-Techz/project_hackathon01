"""v3 error envelope for every route: {"v":3,"error":{"code","requestId"}}. The browser localizes messages."""
from __future__ import annotations


class ApiError(Exception):
    """Raise from a handler to return a clean error response. Never carries user data."""

    def __init__(self, status: int, code: str, headers: dict[str, str] | None = None) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.headers = headers or {}


def invalid_request() -> ApiError:
    return ApiError(400, "INVALID_REQUEST")


def unknown_route() -> ApiError:
    return ApiError(404, "UNKNOWN_ROUTE")


def already_attempted() -> ApiError:
    return ApiError(409, "ALREADY_ATTEMPTED")


def image_too_large() -> ApiError:
    return ApiError(413, "IMAGE_TOO_LARGE")


def unsupported_media() -> ApiError:
    return ApiError(415, "UNSUPPORTED_MEDIA")


def invalid_image() -> ApiError:
    return ApiError(422, "INVALID_IMAGE")


def rate_limited() -> ApiError:
    return ApiError(429, "RATE_LIMITED", {"retry-after": "1"})


def paused() -> ApiError:
    return ApiError(503, "PAUSED")


def daily_limit() -> ApiError:
    return ApiError(503, "DAILY_LIMIT")


def unavailable() -> ApiError:
    return ApiError(503, "TEMPORARILY_UNAVAILABLE")


def ocr_deadline() -> ApiError:
    return ApiError(504, "OCR_DEADLINE")


def envelope(code: str, request_id: str) -> dict:
    return {"v": 3, "error": {"code": code, "requestId": request_id}}
