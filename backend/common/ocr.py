"""OCR adapter: OCR_PROVIDER=mock | textract. Images are bytes in memory; nothing is uploaded or stored.

v3: exactly one provider attempt per admitted request (no SDK or application retries), 4.5 s deadline.
Each line carries its bounding box so the browser can show the source crop beside the field.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from common import config

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "eval" / "ocr" / "fixtures"
PROVIDER_DEADLINE_S = 4.5

Box = tuple[float, float, float, float]  # left, top, right, bottom as fractions of the image

# Canned output for a sample GPay screenshot (fake values), used when no fixture matches the bytes.
_CANNED = [
    ("Paid to", 99.9), ("RAJESH KUMAR", 100.0), ("scammer.refund@ybl", 99.6), ("₹48,000", 99.9),
    ("Completed", 100.0), ("22 Nov 2026, 3:42 pm", 92.4), ("UPI transaction ID", 99.7), ("412345678901", 100.0),
    ("To: RAJESH KUMAR", 99.7), ("Google Pay", 99.6), ("scammer.refund@ybl", 99.4),
    ("From: ANITA SHARMA (State Bank of India)", 98.8), ("1234", 99.8), ("Google transaction ID", 99.8),
    ("CICAgOD7xYqKEQ", 85.9),
]


@dataclass(frozen=True)
class OcrLine:
    text: str
    confidence: float  # 0-100, as Textract reports it
    box: Box = (0.0, 0.0, 1.0, 1.0)


class OcrError(Exception):
    """Provider failed or was throttled. The handler answers 503; the admission stays spent."""


class OcrDeadline(Exception):
    """Provider did not answer within the deadline. The handler answers 504 and ignores any late result."""


class Ocr(Protocol):
    def read(self, image: bytes) -> list[OcrLine]: ...


def canned_lines() -> list[OcrLine]:
    return [OcrLine(t, c, (0.08, 0.08 + i * 0.05, 0.6, 0.12 + i * 0.05)) for i, (t, c) in enumerate(_CANNED)]


class MockOcr:
    """Replays saved real Textract output from eval/ocr/fixtures/<sha256>.json, else canned GPay lines."""

    def read(self, image: bytes) -> list[OcrLine]:
        path = FIXTURES_DIR / f"{hashlib.sha256(image).hexdigest()}.json"
        if path.is_file():
            data = json.loads(path.read_text(encoding="utf-8"))
            return [OcrLine(d["text"], float(d["confidence"]), tuple(d.get("box", (0, 0, 1, 1))))  # type: ignore[arg-type]
                    for d in data["lines"]]
        return canned_lines()


class TextractOcr:
    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        self._client = boto3.client(
            "textract",
            region_name=config.aws_region(),
            config=Config(connect_timeout=1, read_timeout=PROVIDER_DEADLINE_S, retries={"total_max_attempts": 1}),
        )

    def read(self, image: bytes) -> list[OcrLine]:
        from botocore.exceptions import BotoCoreError, ClientError, ReadTimeoutError

        try:
            response = self._client.detect_document_text(Document={"Bytes": image})
        except ReadTimeoutError as exc:
            raise OcrDeadline() from exc
        except ClientError as exc:
            raise OcrError(exc.response.get("Error", {}).get("Code", "error")) from exc
        except BotoCoreError as exc:
            raise OcrError(type(exc).__name__) from exc
        lines = []
        for block in response.get("Blocks", []):
            if block.get("BlockType") != "LINE":
                continue
            bb = block.get("Geometry", {}).get("BoundingBox", {})
            left, top = float(bb.get("Left", 0)), float(bb.get("Top", 0))
            box = (left, top, left + float(bb.get("Width", 1)), top + float(bb.get("Height", 1)))
            lines.append(OcrLine(block.get("Text", ""), float(block.get("Confidence", 0.0)), box))
        return lines


_ocr: Ocr | None = None
_ocr_kind: str | None = None


def get_ocr() -> Ocr:
    global _ocr, _ocr_kind
    kind = config.ocr_provider()
    if _ocr is None or kind != _ocr_kind:
        if kind == "mock":
            _ocr = MockOcr()
        elif kind == "textract":
            _ocr = TextractOcr()
        else:
            raise RuntimeError(f"Unknown OCR_PROVIDER={kind!r}")
        _ocr_kind = kind
    return _ocr
