# Held-out test set

**If you are the builder: do not open `cases.jsonl` while writing or tuning rules.**

To be written by someone who has never seen `backend/rules/`:

- 20 scam messages (any mix of the 8 families, ideally in English, Hindi, Tamil and Hinglish) and
- 10 genuine messages (real bank OTP texts, delivery updates, a family "send ₹500", bill reminders).

One JSON object per line in `cases.jsonl`:

```json
{"text": "…the message…", "family": "digital_arrest"}
{"text": "…a real OTP SMS…", "family": "genuine"}
```

Families: `digital_arrest`, `customs_courier`, `kyc_sim`, `electricity`, `task_job`, `collect_qr`,
`investment`, `relative_trouble`, `genuine`.

Then, once: `.venv/Scripts/python scripts/run_eval.py --freeze-holdout` and commit both files.
CI fails if `cases.jsonl` changes after that.
