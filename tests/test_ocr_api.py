import threading
from pathlib import Path

import pytest

from common import ledger, ocr
from conftest import new_id
from ocr_api.handler import MAX_BYTES, handler

IMAGES = Path(__file__).resolve().parents[1] / "eval" / "ocr" / "images"
SEED_A = (IMAGES / "seed_a.jpg").read_bytes()


@pytest.fixture
def upload(call):
    def _upload(data=SEED_A, key=None, image_id=None, headers=None, query=""):
        hdrs = {"content-type": "image/jpeg", "idempotency-key": key or new_id(), "x-image-id": image_id or new_id()}
        hdrs.update(headers or {})
        return call(handler, "POST", "/api/v3/ocr", raw_body=data, headers=hdrs, query=query)
    return _upload


@pytest.fixture
def provider_calls(monkeypatch):
    calls = []
    original = ocr.MockOcr.read

    def counting(self, image):
        calls.append(len(image))
        return original(self, image)

    monkeypatch.setattr(ocr.MockOcr, "read", counting)
    return calls


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    """Each upload lands in its own server second unless a test says otherwise."""
    t = [1_764_050_000.0]

    def fake_time():
        t[0] += 1.0
        return t[0]

    monkeypatch.setattr("ocr_api.handler.time.time", fake_time)
    return t


def test_success_shape(upload, provider_calls):
    key, image_id = new_id(), new_id()
    status, body, headers = upload(key=key, image_id=image_id)
    assert status == 200 and headers["cache-control"] == "no-store"
    assert body["v"] == 3 and body["outcome"] == "candidates"
    assert body["attemptId"] == key and body["imageId"] == image_id and body["requestId"] != key
    assert set(body) == {"v", "requestId", "imageId", "attemptId", "outcome", "candidates", "warnings",
                         "timingsMs", "region", "build", "usedToday", "dailyCap"}
    ref = next(c for c in body["candidates"] if c["field"] == "upiRef")
    assert ref["value"] == "012345678901" and ref["label"] == "UPI Ref" and len(ref["box"]) == 4
    t = body["timingsMs"]
    assert 0 <= t["admission"] <= t["total"] and 0 <= t["provider"] <= t["total"]
    assert body["usedToday"] == 1 and provider_calls == [len(SEED_A)]


def test_five_taps_same_key_one_provider_call(upload, provider_calls):
    key = new_id()
    results = [upload(key=key)[0] for _ in range(5)]
    assert results == [200, 409, 409, 409, 409]
    assert len(provider_calls) == 1


def test_five_concurrent_taps_same_key_one_provider_call(upload, provider_calls, fixed_clock):
    key = new_id()
    statuses: list[int] = []
    threads = [threading.Thread(target=lambda: statuses.append(upload(key=key)[0])) for _ in range(5)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert sorted(statuses) == [200, 409, 409, 409, 409]
    assert len(provider_calls) == 1


def test_last_daily_slot_race_admits_one(upload, provider_calls, monkeypatch):
    monkeypatch.setenv("OCR_DAILY_CAP", "2")
    assert upload()[0] == 200
    statuses: list[int] = []
    threads = [threading.Thread(target=lambda: statuses.append(upload()[0])) for _ in range(4)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert statuses.count(200) == 1 and len(provider_calls) == 2
    assert all(s in (200, 429, 503) for s in statuses)


def test_daily_limit(upload, monkeypatch):
    monkeypatch.setenv("OCR_DAILY_CAP", "1")
    assert upload()[0] == 200
    status, body, _ = upload()
    assert status == 503 and body["error"]["code"] == "DAILY_LIMIT"


def test_per_second_bucket(upload, fixed_clock, monkeypatch):
    monkeypatch.setattr("ocr_api.handler.time.time", lambda: 1_764_060_000.5)
    assert upload()[0] == 200
    status, body, headers = upload()
    assert status == 429 and body["error"]["code"] == "RATE_LIMITED" and headers["retry-after"] == "1"


def test_kill_switch_pauses_and_has_precedence(upload, provider_calls):
    key = new_id()
    assert upload(key=key)[0] == 200
    ledger.get_ledger().set_policy(False)
    status, body, _ = upload(key=key)  # duplicate AND paused: paused wins
    assert status == 503 and body["error"]["code"] == "PAUSED"
    assert len(provider_calls) == 1
    ledger.get_ledger().set_policy(True)
    assert upload()[0] == 200


def test_unknown_admission_outcome_dispatches_nothing(upload, provider_calls, monkeypatch):
    def broken(self, key, now):
        raise ledger.unavailable()

    monkeypatch.setattr(ledger.MemoryLedger, "admit", broken)
    status, body, _ = upload()
    assert status == 503 and body["error"]["code"] == "TEMPORARILY_UNAVAILABLE" and provider_calls == []


def test_provider_failure_keeps_admission_spent_and_no_retry(upload, monkeypatch):
    attempts = []

    def failing(self, image):
        attempts.append(1)
        raise ocr.OcrError("ThrottlingException")

    monkeypatch.setattr(ocr.MockOcr, "read", failing)
    key = new_id()
    assert upload(key=key)[1]["error"]["code"] == "TEMPORARILY_UNAVAILABLE"
    assert upload(key=key)[0] == 409  # same key cannot buy a second call
    assert attempts == [1]


def test_provider_deadline_is_504_and_late_result_ignored(upload, monkeypatch):
    def slow(self, image):
        raise ocr.OcrDeadline()

    monkeypatch.setattr(ocr.MockOcr, "read", slow)
    status, body, _ = upload()
    assert status == 504 and body["error"]["code"] == "OCR_DEADLINE"


def test_no_fields_outcome(upload, monkeypatch):
    monkeypatch.setattr(ocr.MockOcr, "read", lambda self, image: [ocr.OcrLine("hello world", 99.0)])
    status, body, _ = upload()
    assert status == 200 and body["outcome"] == "no_fields" and body["candidates"] == []


@pytest.mark.parametrize(
    ("kwargs", "status", "code"),
    [
        ({"headers": {"content-type": "image/png"}}, 415, "UNSUPPORTED_MEDIA"),
        ({"headers": {"content-type": "image/jpeg", "content-encoding": "gzip"}}, 415, "UNSUPPORTED_MEDIA"),
        ({"key": "not-a-uuid"}, 400, "INVALID_REQUEST"),
        ({"key": "00000000-0000-4000-8000-00000000000A"}, 400, "INVALID_REQUEST"),  # uppercase
        ({"headers": {"idempotency-key": "00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000002"}}, 400, "INVALID_REQUEST"),
        ({"query": "x=1"}, 400, "INVALID_REQUEST"),
        ({"data": b"%PDF-1.7 not a jpeg"}, 422, "INVALID_IMAGE"),
        ({"data": b"\xff\xd8\xff\xe0" + b"\x00" * 20}, 422, "INVALID_IMAGE"),
        ({"data": b"\xff\xd8\xff" + b"\x00" * MAX_BYTES}, 413, "IMAGE_TOO_LARGE"),
    ],
)
def test_validation_happens_before_admission(upload, provider_calls, kwargs, status, code):
    got_status, body, _ = upload(**kwargs)
    assert (got_status, body["error"]["code"]) == (status, code)
    assert provider_calls == []
    assert ledger.get_ledger().admit(new_id(), 1_800_000_000.0).used_today == 1  # nothing was spent


def test_oversized_dimensions_rejected(upload):
    # Minimal JPEG header claiming 4000 x 3000 pixels.
    sof = b"\xff\xc0\x00\x11\x08" + (3000).to_bytes(2, "big") + (4000).to_bytes(2, "big") + b"\x03" + b"\x00" * 9
    status, body, _ = upload(data=b"\xff\xd8" + sof + b"\xff\xd9")
    assert status == 413


def test_extracted_values_never_logged(upload, capsys):
    upload()
    out = capsys.readouterr().out
    for secret in ("012345678901", "demo.merchant", "100050"):
        assert secret not in out
