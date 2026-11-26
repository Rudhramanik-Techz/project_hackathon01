"""Run real Textract on eval/ocr/images/* once and save the lines to eval/ocr/fixtures/<sha256>.json.

The mock OCR adapter replays these, so tests and local dev use real Textract output without
calling AWS. Only run this on synthetic or your own consented screenshots.

    AWS_PROFILE=asli .venv/Scripts/python scripts/capture_ocr_fixtures.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ["OCR_PROVIDER"] = "textract"

from common.ocr import FIXTURES_DIR, TextractOcr  # noqa: E402

IMAGES = ROOT / "eval" / "ocr" / "images"


def main() -> int:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    ocr = TextractOcr()
    for path in sorted(IMAGES.glob("*")):
        if path.suffix.lower() not in {".jpg", ".jpeg"}:
            continue
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        lines = ocr.read(data)
        out = FIXTURES_DIR / f"{digest}.json"
        out.write_text(
            json.dumps({"image": path.name, "lines": [{"text": l.text, "confidence": round(l.confidence, 2), "box": [round(v, 5) for v in l.box]} for l in lines]},
                       ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        low = sum(l.confidence < 90 for l in lines)
        print(f"{path.name}: {len(lines)} lines, {low} under 90% -> fixtures/{digest[:12]}...json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
