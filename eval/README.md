# Evaluation data

| Folder | Written by | Rules may be tuned on it? | Format |
|---|---|---|---|
| `dev/cases.jsonl` | you, from real news reports and advisories | yes | one JSON object per line: `{"text": "...", "family": "digital_arrest", "source": "https://..."}` (use `"family": "genuine"` for real non-scam messages) |
| `holdout/cases.jsonl` | a friend who has never seen `backend/rules/` | **never**: don't open it while writing rules | same as dev; 20 scam + 10 genuine; its SHA-256 goes in `holdout/SHA256` and CI fails if it changes |
| `ocr/` | you: synthetic UPI-style screenshots | n/a | images plus `truth.json` with true amount, UTR and time per image |

Family names: `digital_arrest`, `customs_courier`, `kyc_sim`, `electricity`, `task_job`,
`collect_qr`, `investment`, `relative_trouble`, or `genuine`.

`scripts/run_eval.py` (Phase 6) reports holdout numbers only, and skips any file that is still missing.
