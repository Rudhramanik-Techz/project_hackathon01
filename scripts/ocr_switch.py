"""Operator kill switch for paid OCR (v3): writes POLICY#OCR in the ledger. The runtime role cannot do this.

    AWS_PROFILE=asli .venv/Scripts/python scripts/ocr_switch.py on    # enable screenshot reading
    AWS_PROFILE=asli .venv/Scripts/python scripts/ocr_switch.py off   # pause it; everything else keeps working

Admissions serialized after the switch see the new value; an attempt admitted just before may still finish.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ.setdefault("AWS_REGION", "ap-south-1")

from common.ledger import DynamoLedger  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"on", "off"}:
        print(__doc__)
        return 2
    table = os.environ.get("TABLE_NAME", "asli-ledger")
    DynamoLedger(table).set_policy(sys.argv[1] == "on")
    print(f"POLICY#OCR in {table}: enabled={sys.argv[1] == 'on'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
