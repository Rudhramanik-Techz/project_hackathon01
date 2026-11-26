"""The DynamoDB ledger (real TransactWriteItems via moto) must behave exactly like the memory ledger."""
import boto3
import pytest
from moto import mock_aws

from common.errors import ApiError
from common.ledger import DynamoLedger, MemoryLedger, day_expiry, utc_day
from conftest import new_id

T0 = 1_764_050_000.0  # 2025-11-25 UTC


@pytest.fixture(params=["memory", "dynamodb"])
def make_ledger(request, monkeypatch):
    if request.param == "memory":
        yield lambda enabled=True: MemoryLedger(enabled)
        return
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    with mock_aws():
        boto3.client("dynamodb", region_name="ap-south-1").create_table(
            TableName="asli-ledger", KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}], BillingMode="PAY_PER_REQUEST")

        def make(enabled=True):
            led = DynamoLedger("asli-ledger")
            led.set_policy(enabled)
            return led

        yield make


def code(fn):
    with pytest.raises(ApiError) as exc:
        fn()
    return exc.value.code


def test_admits_and_counts(make_ledger):
    led = make_ledger()
    assert led.admit(new_id(), T0).used_today == 1
    assert led.admit(new_id(), T0 + 1).used_today == 2


def test_duplicate_key_is_409(make_ledger):
    led, key = make_ledger(), new_id()
    led.admit(key, T0)
    assert code(lambda: led.admit(key, T0 + 5)) == "ALREADY_ATTEMPTED"


def test_same_second_is_rate_limited(make_ledger):
    led = make_ledger()
    led.admit(new_id(), T0)
    assert code(lambda: led.admit(new_id(), T0 + 0.4)) == "RATE_LIMITED"


def test_daily_cap(make_ledger, monkeypatch):
    monkeypatch.setenv("OCR_DAILY_CAP", "2")
    led = make_ledger()
    led.admit(new_id(), T0)
    led.admit(new_id(), T0 + 1)
    assert code(lambda: led.admit(new_id(), T0 + 2)) == "DAILY_LIMIT"
    assert led.admit(new_id(), T0 + 86400).used_today == 1  # next UTC day


def test_disabled_or_missing_policy_pauses(make_ledger):
    led = make_ledger(enabled=False)
    assert code(lambda: led.admit(new_id(), T0)) == "PAUSED"


def test_precedence_paused_then_duplicate(make_ledger):
    led, key = make_ledger(), new_id()
    led.admit(key, T0)
    led.set_policy(False)
    assert code(lambda: led.admit(key, T0 + 3)) == "PAUSED"
    led.set_policy(True)
    assert code(lambda: led.admit(key, T0 + 4)) == "ALREADY_ATTEMPTED"


def test_failed_transaction_writes_nothing(make_ledger, monkeypatch):
    monkeypatch.setenv("OCR_DAILY_CAP", "2")
    led, key = make_ledger(), new_id()
    led.admit(new_id(), T0)
    code(lambda: led.admit(key, T0 + 0.5))  # rate limited: the REQ tombstone must not be written
    assert led.admit(key, T0 + 2).used_today == 2


def test_llm_cap(make_ledger, monkeypatch):
    monkeypatch.setenv("LLM_DAILY_CAP", "2")
    led = make_ledger()
    assert [led.llm_admit(T0) for _ in range(3)] == [True, True, False]


def test_day_helpers():
    assert utc_day(T0) == "2025-11-25"
    assert day_expiry(T0) == 1_764_115_200 + 3 * 86400
