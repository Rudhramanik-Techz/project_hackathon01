import json
from datetime import datetime
from pathlib import Path

import pytest

from common.config import IST
from common.ocr import FIXTURES_DIR, OcrLine
from golden_hour.parsers import box_bp, extract, parse_paise

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=IST)
TRUTH = json.loads((Path(__file__).resolve().parents[1] / "eval/ocr/truth.json").read_text(encoding="utf-8"))


def lines(*texts, conf=99.0):
    return [OcrLine(t, conf, (0.1, 0.05 * i, 0.6, 0.05 * i + 0.04)) for i, t in enumerate(texts)]


def _fixtures():
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data["image"] in TRUTH:
            yield data["image"], [OcrLine(l["text"], l["confidence"], tuple(l["box"])) for l in data["lines"]]


@pytest.mark.parametrize(("image", "ocr_lines"), list(_fixtures()))
def test_top_candidates_match_truth_on_real_textract_output(image, ocr_lines):
    """Replays real Textract output (captured once) for each synthetic screenshot."""
    ex = extract(ocr_lines, now=NOW)
    for field, expected in TRUTH[image].items():
        assert ex.best(field) == (None if expected is None else str(expected)), field


def test_every_truth_image_has_a_fixture():
    assert {name for name, _ in _fixtures()} == set(TRUTH)


def test_leading_zero_reference_survives():
    ex = extract(lines("UPI Ref", "012345678901"), now=NOW)
    assert ex.best("upiRef") == "012345678901"


def test_competing_references_are_all_offered_with_labels():
    ex = extract(lines("UPI Ref", "012345678901", "Order ID", "812345678901"), now=NOW)
    refs = [c for c in ex.candidates if c.field == "upiRef"]
    assert [(c.value, c.label) for c in refs] == [("012345678901", "UPI Ref"), ("812345678901", "Order ID")]
    assert "multiple_refs" in ex.warnings


def test_paise_are_exact():
    assert parse_paise("1,00,000", "50") == 10000050
    assert parse_paise("9,999", "5") == 999950
    assert extract(lines("₹1,00,000.50"), now=NOW).best("amountPaise") == "10000050"
    assert extract(lines("Rs.1,50,000"), now=NOW).best("amountPaise") == "15000000"


def test_sender_and_receiver_vpas_are_separated():
    ex = extract(lines("From: me.self@oksbi", "Paid to", "thief.99@ybl"), now=NOW)
    assert ex.best("receiverVpa") == "thief.99@ybl"
    assert ex.best("senderVpa") == "me.self@oksbi"


def test_email_is_not_a_vpa():
    assert extract(lines("Contact support@gmail.com"), now=NOW).best("receiverVpa") is None


def test_unknown_handle_is_offered_but_labelled():
    ex = extract(lines("Paid to", "someone@weirdbank"), now=NOW)
    cand = next(c for c in ex.candidates if c.field == "receiverVpa")
    assert cand.value == "someone@weirdbank" and cand.label == "unfamiliar handle"


def test_wrong_length_number_under_utr_label_is_not_guessed():
    ex = extract(lines("UTR: 41234567890"), now=NOW)  # 11 digits
    assert ex.best("upiRef") is None and ex.best("bankRef") is None


def test_unlabelled_utr_is_weakest_and_warned():
    ex = extract(lines("₹500", "412345678901"), now=NOW)
    assert ex.best("upiRef") == "412345678901" and "ambiguous_label" in ex.warnings


def test_minute_precision_is_kept_and_seconds_not_invented():
    assert extract(lines("22 Nov 2026, 3:42 pm"), now=NOW).best("occurredAt") == "2026-11-22T15:42+05:30"
    assert extract(lines("22/11/2026 16:47:10"), now=NOW).best("occurredAt") == "2026-11-22T16:47:10+05:30"


def test_date_without_year_or_time_is_not_fabricated():
    assert extract(lines("22 Nov, 3:42 pm"), now=NOW).best("occurredAt") is None
    assert extract(lines("22 Nov 2026"), now=NOW).best("occurredAt") is None


def test_future_time_is_ranked_down_and_labelled():
    ex = extract(lines("30 Nov 2026, 3:00 pm"), now=NOW)
    cand = next(c for c in ex.candidates if c.field == "occurredAt")
    assert cand.label == "time in the future"


def test_direction_and_status():
    ex = extract(lines("Paid to", "Completed"), now=NOW)
    assert (ex.best("direction"), ex.best("paymentStatus")) == ("outgoing", "completed")
    ex = extract(lines("Received from", "Refunded"), now=NOW)
    assert (ex.best("direction"), ex.best("paymentStatus")) == ("incoming", "reversed")


def test_ids_are_sequential_after_ranking_and_capped():
    many = lines(*[f"₹{i},000" for i in range(1, 40)])
    ex = extract(many, now=NOW)
    assert len(ex.candidates) == 32 and "truncated_candidates" in ex.warnings
    assert [c.id for c in ex.candidates[:3]] == ["c1", "c2", "c3"]


def test_low_confidence_warning():
    ex = extract([OcrLine("UTR 412345678901", 85.0)], now=NOW)
    assert "low_confidence" in ex.warnings


def test_box_basis_points_round_outward_and_never_degenerate():
    assert box_bp((0.12345, 0.5, 0.99999, 0.6)) == [1234, 5000, 10000, 6000]
    assert box_bp((1.0, 1.0, 1.0, 1.0)) == [9999, 9999, 10000, 10000]
    left, top, right, bottom = box_bp((0.3, 0.3, 0.3, 0.3))
    assert left < right and top < bottom


def test_empty_input():
    ex = extract([], now=NOW)
    assert ex.candidates == [] and ex.warnings == []
