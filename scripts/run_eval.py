"""Honest evaluation -> eval/report.md

* Scam check: reported on eval/holdout/cases.jsonl ONLY (written by someone who never saw the rules).
  eval/dev/ is summarised separately and labelled as tuned-on.
* OCR: field accuracy (amount, UTR, time, VPA) on eval/ocr/ against truth.json.
  --live uses real Textract (OCR_PROVIDER=textract); otherwise saved Textract fixtures are replayed.
* Missing or placeholder files are skipped with a warning. Nothing is ever invented.

    .venv/Scripts/python scripts/run_eval.py                  # CI / offline
    AWS_PROFILE=asli .venv/Scripts/python scripts/run_eval.py --live
    .venv/Scripts/python scripts/run_eval.py --freeze-holdout # once, after the friend's file lands
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

EVAL = ROOT / "eval"
HOLDOUT = EVAL / "holdout" / "cases.jsonl"
HOLDOUT_HASH = EVAL / "holdout" / "SHA256"
DEV = EVAL / "dev" / "cases.jsonl"
OCR_DIR = EVAL / "ocr"
REPORT = EVAL / "report.md"
GENUINE = "genuine"


def warn(msg: str) -> None:
    print(f"WARNING: {msg}", file=sys.stderr)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_cases(path: Path) -> list[dict] | None:
    if not path.is_file():
        return None
    cases = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("//"):
            continue
        case = json.loads(line)
        if not isinstance(case.get("text"), str) or not isinstance(case.get("family"), str):
            raise SystemExit(f"{path}:{n}: each line needs 'text' and 'family'")
        cases.append(case)
    return cases or None


def classify(cases: list[dict]) -> list[dict]:
    from common.rules import engine

    e = engine()
    out = []
    for c in cases:
        v = e.evaluate(e.normalise(c["text"]))
        out.append({**c, "tier": v.tier, "score": v.score, "pred_family": v.family,
                    "flagged": v.tier != "no_known_pattern", "rules": [m.id for m in v.matched]})
    return out


def scam_section(title: str, results: list[dict], examples: bool) -> list[str]:
    scams = [r for r in results if r["family"] != GENUINE]
    genuine = [r for r in results if r["family"] == GENUINE]
    flagged = sum(r["flagged"] for r in scams)
    likely = sum(r["tier"] == "likely_scam" for r in scams)
    fp = sum(r["flagged"] for r in genuine)
    lines = [f"## {title}", ""]
    lines.append(f"- **{flagged} of {len(scams)} scams flagged** (Suspicious or Likely scam); {likely} of {len(scams)} as Likely scam.")
    if genuine:
        lines.append(f"- **{fp} of {len(genuine)} genuine messages wrongly flagged** (false-positive rate {fp / len(genuine):.0%}).")
    lines.append(f"- n = {len(results)}.")
    lines += ["", "| Family | Cases | Flagged | Right family |", "|---|---|---|---|"]
    by_family: dict[str, list[dict]] = defaultdict(list)
    for r in scams:
        by_family[r["family"]].append(r)
    for fam in sorted(by_family):
        rs = by_family[fam]
        lines.append(f"| {fam} | {len(rs)} | {sum(r['flagged'] for r in rs)} | {sum(r['pred_family'] == fam for r in rs)} |")

    # Confusion table: true family (rows) x predicted family (columns); "none" = not flagged.
    preds = sorted({(r["pred_family"] if r["flagged"] else "none") for r in results})
    truths = sorted({r["family"] for r in results})
    counts = Counter((r["family"], r["pred_family"] if r["flagged"] else "none") for r in results)
    lines += ["", "Confusion table (rows: true, columns: predicted; `none` = not flagged):", "",
              "| true \\ predicted | " + " | ".join(preds) + " |", "|---|" + "---|" * len(preds)]
    for t in truths:
        lines.append(f"| {t} | " + " | ".join(str(counts.get((t, p), 0) or "") for p in preds) + " |")

    if examples:
        misses = [r for r in results if (r["family"] == GENUINE) == r["flagged"]][:2]
        lines += ["", "Misclassified examples:" if misses else "No misclassified examples.", ""]
        for r in misses:
            what = "false positive" if r["family"] == GENUINE else "missed scam"
            text = r["text"].replace("\n", " ")
            lines.append(f"- *{what}* ({r['family']} → {r['tier']}, score {r['score']}, rules {r['rules'] or '-'}): "
                         f"\"{text[:180]}{'…' if len(text) > 180 else ''}\"")
    return lines + [""]


def ocr_section(live: bool) -> list[str]:
    truth_path = OCR_DIR / "truth.json"
    if not truth_path.is_file():
        warn("eval/ocr/truth.json missing: skipping OCR accuracy")
        return ["## Golden Hour OCR", "", "_Skipped: eval/ocr/truth.json not found._", ""]
    os.environ["OCR_PROVIDER"] = "textract" if live else "mock"
    from common.config import IST
    from common.ocr import FIXTURES_DIR, get_ocr
    from golden_hour.parsers import extract

    truth = json.loads(truth_path.read_text(encoding="utf-8"))
    ocr = get_ocr()
    fields = ("amountPaise", "upiRef", "occurredAt", "receiverVpa")
    right, total = Counter(), Counter()
    rows, skipped, whole = [], [], 0
    now = datetime(2026, 11, 25, 12, 0, tzinfo=IST)  # fixed clock: fixtures are dated Nov 22-25 2026
    for name, expected in truth.items():
        image = OCR_DIR / "images" / name
        if not image.is_file():
            skipped.append(name)
            continue
        data = image.read_bytes()
        if not live and not (FIXTURES_DIR / f"{hashlib.sha256(data).hexdigest()}.json").is_file():
            skipped.append(f"{name} (no fixture; run with --live or capture_ocr_fixtures.py)")
            continue
        ex = extract(ocr.read(data), now=now)
        cells = []
        all_ok = True
        for f in fields:
            if f not in expected:
                cells.append("–")
                continue
            want = None if expected[f] is None else str(expected[f])
            ok = ex.best(f) == want
            total[f] += 1
            right[f] += ok
            all_ok &= ok
            cells.append("✓" if ok else "✗")
        whole += all_ok
        rows.append(f"| {name} | " + " | ".join(cells) + f" | {', '.join(ex.warnings) or '-'} |")
    n = len(rows)
    mode = "real Textract (live)" if live else "real Textract output replayed from saved fixtures"
    lines = ["## Golden Hour OCR (top-ranked candidate, before human review)", "",
             f"Synthetic payment screenshots with fake values, written by the builder; OCR = {mode}. "
             "These are development layouts, not an independent held-out set.", ""]
    if not n:
        return lines + ["_Skipped: no images could be evaluated._", ""]
    lines.append("- Top candidate correct: " + ", ".join(f"**{f} {right[f]}/{total[f]}**" for f in fields)
                 + f"; all fields right on **{whole}/{n}** screenshots.")
    lines += ["", "| Screenshot | amount | UPI ref | time | receiver VPA | warnings |", "|---|---|---|---|---|---|", *rows]
    if skipped:
        lines += ["", "Skipped: " + "; ".join(skipped)]
    return lines + [""]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="call real Textract for the OCR set")
    parser.add_argument("--freeze-holdout", action="store_true", help="write eval/holdout/SHA256")
    args = parser.parse_args()

    if args.freeze_holdout:
        if not HOLDOUT.is_file():
            raise SystemExit("eval/holdout/cases.jsonl not found")
        HOLDOUT_HASH.write_text(sha256(HOLDOUT) + "\n", encoding="utf-8")
        print(f"froze holdout: {HOLDOUT_HASH.read_text().strip()}")
        return 0

    from common.rules import rules_version

    out = ["# Evaluation report", "",
           f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} by `scripts/run_eval.py`; rules version `{rules_version()}`.", ""]

    holdout = load_cases(HOLDOUT)
    if holdout is None:
        warn("eval/holdout/cases.jsonl missing or empty: no headline accuracy number")
        out += ["## Scam check: held-out set (headline)", "",
                "_Not reported yet: the held-out file has not been added. No number is quoted until it is._", ""]
    else:
        integrity = "hash not frozen yet (run --freeze-holdout)"
        if HOLDOUT_HASH.is_file():
            integrity = "hash matches eval/holdout/SHA256" if HOLDOUT_HASH.read_text().strip() == sha256(HOLDOUT) \
                else "**HASH MISMATCH: the held-out file changed after it was frozen**"
        out += scam_section("Scam check: held-out set (headline)", classify(holdout), examples=True)
        out.insert(-1, f"_Written by someone who never saw the rules; {integrity}._")

    dev = load_cases(DEV)
    if dev is None:
        warn("eval/dev/cases.jsonl missing or empty")
    else:
        out += scam_section("Scam check: dev set (rules were tuned on this; not a headline number)",
                            classify(dev), examples=False)

    out += ocr_section(args.live)
    REPORT.write_text("\n".join(out), encoding="utf-8")
    print(f"wrote {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
