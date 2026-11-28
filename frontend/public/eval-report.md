# Evaluation report

Generated 2026-11-27 21:32 by `scripts/run_eval.py`; rules version `78c4113fe037`.

## Scam check: held-out set (headline)

_Not reported yet: the held-out file has not been added. No number is quoted until it is._

## Golden Hour OCR (top-ranked candidate, before human review)

Synthetic payment screenshots with fake values, written by the builder; OCR = real Textract output replayed from saved fixtures. These are development layouts, not an independent held-out set.

- Top candidate correct: **amountPaise 9/9**, **upiRef 9/9**, **occurredAt 9/9**, **receiverVpa 9/9**; all fields right on **9/9** screenshots.

| Screenshot | amount | UPI ref | time | receiver VPA | warnings |
|---|---|---|---|---|---|
| gpay_48000.jpg | ✓ | ✓ | ✓ | ✓ | low_confidence |
| phonepe_25000.jpg | ✓ | ✓ | ✓ | ✓ | low_confidence |
| paytm_150000.jpg | ✓ | ✓ | ✓ | ✓ | - |
| bhim_9999.jpg | ✓ | ✓ | ✓ | ✓ | - |
| gpay_hindi_5000.jpg | ✓ | ✓ | ✓ | ✓ | ambiguous_label |
| gpay_tamil_12500.jpg | ✓ | ✓ | ✓ | ✓ | ambiguous_label |
| seed_a.jpg | ✓ | ✓ | ✓ | ✓ | multiple_refs |
| seed_b1.jpg | ✓ | ✓ | ✓ | ✓ | - |
| seed_b2.jpg | ✓ | ✓ | ✓ | ✓ | - |
