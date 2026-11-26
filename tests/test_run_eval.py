import json

import run_eval


def test_holdout_section_counts_and_examples(tmp_path, monkeypatch):
    cases = [
        {"text": "This is CBI. Stay on the video call and transfer savings to the RBI verification account now.",
         "family": "digital_arrest"},
        {"text": "hello how are you", "family": "relative_trouble"},  # a miss
        {"text": "Your OTP is 123456. Do not share it with anyone.", "family": "genuine"},
    ]
    path = tmp_path / "cases.jsonl"
    path.write_text("\n".join(json.dumps(c) for c in cases), encoding="utf-8")
    loaded = run_eval.load_cases(path)
    lines = "\n".join(run_eval.scam_section("Held-out", run_eval.classify(loaded), examples=True))
    assert "**1 of 2 scams flagged**" in lines
    assert "**0 of 1 genuine messages wrongly flagged**" in lines
    assert "missed scam" in lines and "hello how are you" in lines


def test_missing_file_returns_none(tmp_path):
    assert run_eval.load_cases(tmp_path / "nope.jsonl") is None
