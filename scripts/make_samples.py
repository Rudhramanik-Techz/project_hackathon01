"""Build the demo seeds (v3) for the frontend from real Textract fixtures.

Writes frontend/src/samples/samples.json, copies the seed screenshots to frontend/public/samples/ and the
evaluation report to frontend/public/eval-report.md. Seeds are synthetic and always labelled "precomputed"
in the UI; "Run live" sends the same image through the real API.

    .venv/Scripts/python scripts/make_samples.py
"""
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from common.config import IST  # noqa: E402
from common.jpeg import jpeg_size  # noqa: E402
from common.ocr import MockOcr  # noqa: E402
from golden_hour.parsers import extract  # noqa: E402

IMAGES = ROOT / "eval" / "ocr" / "images"
CLOCK = "2026-11-25T12:00+05:30"  # fixed scenario clock: seed A shows "41 minutes since payment"

# Fictional demo messages (not real victims' messages). C is a genuine bank reminder (ground truth: genuine).
CHECK = {
    "digitalArrest": (
        "This is Inspector Vijay Sharma, CBI cyber cell Mumbai. A parcel in your Aadhaar name with illegal drugs "
        "was seized. An arrest warrant has been issued against you in a money laundering case. Stay on this video "
        "call and do not tell anyone in your family. Transfer your savings to the RBI verification account "
        "immediately to prove your innocence."
    ),
    "courier": (
        "FedEx Alert: Your parcel to Taiwan has been seized by customs. It contains 5 fake passports and MDMA. "
        "A case is registered against you. Press 1 to speak to our customs officer. Pay the clearance fee "
        "immediately to avoid arrest."
    ),
    "genuine": (
        "For your records: your monthly statement is ready in the bank app. "
        "Please do not share your PIN with anyone."
    ),
}
SEEDS = {"A": ["seed_a.jpg"], "B": ["seed_b1.jpg", "seed_b2.jpg"]}


def main() -> int:
    public = ROOT / "frontend" / "public" / "samples"
    public.mkdir(parents=True, exist_ok=True)
    now = datetime.fromisoformat(CLOCK).astimezone(IST)
    seeds: dict = {}
    for seed, files in SEEDS.items():
        images = []
        for name in files:
            data = (IMAGES / name).read_bytes()
            width, height = jpeg_size(data) or (0, 0)
            ex = extract(MockOcr().read(data), now=now)
            shutil.copyfile(IMAGES / name, public / name)
            images.append({"file": f"/samples/{name}", "width": width, "height": height,
                           "candidates": [c.to_dict() for c in ex.candidates], "warnings": ex.warnings})
            print(f"seed {seed}: {name} {len(ex.candidates)} candidates {ex.warnings}")
        seeds[seed] = {"clock": CLOCK, "images": images}

    out = ROOT / "frontend" / "src" / "samples" / "samples.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"check": CHECK, "seeds": seeds}, ensure_ascii=False, indent=1), encoding="utf-8")
    report = ROOT / "eval" / "report.md"
    if report.is_file():
        shutil.copyfile(report, ROOT / "frontend" / "public" / "eval-report.md")
    print(f"wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
