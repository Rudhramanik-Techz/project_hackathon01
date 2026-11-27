"""Paid-call admission ledger (v3). One DynamoDB table, partition key `pk` only, TTL on `expiresAt`.

Rows (no user data, no case data):
  POLICY#OCR   enabled:BOOL, contractEpoch:N=3           operator kill switch, checked inside the transaction
  REQ#<uuid>   admittedAt, expiresAt = +48 h             one admission per public intent key
  DAY#<UTC>    used 1..cap, expiresAt = day end + 3 d    daily OCR cap
  SEC#<epoch>  used = 1, expiresAt = second + 601 s      at most one admission per server second
  LLMDAY#<UTC> used 1..cap                               daily cap for the optional explanation model
  TRDAY#<UTC>  used 1..cap                               daily cap for the optional story translation

admit() submits ONE transaction with a fresh private token. Only an acknowledged success authorizes the single
Textract call. Any unknown outcome raises 503 and authorizes nothing. Nothing is ever refunded or retried.
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from common import config
from common.errors import ApiError, already_attempted, daily_limit, paused, rate_limited, unavailable

CONTRACT_EPOCH = 3
REQ_TTL = 48 * 3600
DAY_GRACE = 3 * 24 * 3600
SEC_GRACE = 600


def utc_day(now: float) -> str:
    return datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%d")


def day_expiry(now: float) -> int:
    day = datetime.fromtimestamp(now, timezone.utc).date()
    end = datetime(day.year, day.month, day.day, tzinfo=timezone.utc) + timedelta(days=1)
    return int(end.timestamp()) + DAY_GRACE


@dataclass(frozen=True)
class Admission:
    used_today: int | None


class MemoryLedger:
    """Same semantics as DynamoLedger, for local dev and tests. Expiry is logical (checked on access)."""

    def __init__(self, enabled: bool = True) -> None:
        self._lock = threading.Lock()
        self._rows: dict[str, dict] = {"POLICY#OCR": {"enabled": enabled, "contractEpoch": CONTRACT_EPOCH}}

    def set_policy(self, enabled: bool) -> None:
        with self._lock:
            self._rows["POLICY#OCR"] = {"enabled": enabled, "contractEpoch": CONTRACT_EPOCH}

    def _live(self, pk: str, now: float) -> dict | None:
        row = self._rows.get(pk)
        if row and "expiresAt" in row and row["expiresAt"] <= now:
            return None
        return row

    def admit(self, key: str, now: float) -> Admission:
        cap = config.ocr_daily_cap()
        sec = int(now)
        with self._lock:  # the whole check-and-write is atomic, like a DynamoDB transaction
            policy = self._rows.get("POLICY#OCR")
            day_pk, sec_pk, req_pk = f"DAY#{utc_day(now)}", f"SEC#{sec}", f"REQ#{key}"
            day = self._live(day_pk, now)
            failed = [
                not (policy and policy.get("enabled") is True and policy.get("contractEpoch") == CONTRACT_EPOCH),
                self._live(req_pk, now) is not None,
                day is not None and not (1 <= day["used"] <= cap - 1),
                self._live(sec_pk, now) is not None,
            ]
            if any(failed):
                raise _denial(failed)
            self._rows[req_pk] = {"admittedAt": sec, "expiresAt": sec + REQ_TTL}
            used = (day["used"] if day else 0) + 1
            self._rows[day_pk] = {"used": used, "expiresAt": day_expiry(now)}
            self._rows[sec_pk] = {"used": 1, "expiresAt": sec + 1 + SEC_GRACE}
            return Admission(used)

    def llm_admit(self, now: float) -> bool:
        return self.daily_admit("LLMDAY", config.llm_daily_cap(), now)

    def translate_admit(self, now: float) -> bool:
        return self.daily_admit("TRDAY", config.translate_daily_cap(), now)

    def daily_admit(self, prefix: str, cap: int, now: float) -> bool:
        with self._lock:
            pk = f"{prefix}#{utc_day(now)}"
            row = self._live(pk, now)
            used = (row["used"] if row else 0) + 1
            if used > cap:
                return False
            self._rows[pk] = {"used": used, "expiresAt": day_expiry(now)}
            return True


def _denial(failed: list[bool]) -> ApiError:
    """Precedence when several conditions fail: paused -> duplicate -> daily -> per-second."""
    if failed[0]:
        return paused()
    if failed[1]:
        return already_attempted()
    if failed[2]:
        return daily_limit()
    if failed[3]:
        return rate_limited()
    return unavailable()


class DynamoLedger:
    def __init__(self, table: str) -> None:
        import boto3
        from botocore.config import Config

        self.table = table
        self._client = boto3.client(
            "dynamodb",
            region_name=config.aws_region(),
            config=Config(connect_timeout=1, read_timeout=2, retries={"total_max_attempts": 1}),
        )

    def set_policy(self, enabled: bool) -> None:
        """Operator action (scripts/ocr_switch.py). The OCR runtime role is not allowed to call this."""
        self._client.put_item(
            TableName=self.table,
            Item={"pk": {"S": "POLICY#OCR"}, "v": {"N": "3"}, "enabled": {"BOOL": enabled},
                  "contractEpoch": {"N": str(CONTRACT_EPOCH)}},
        )

    def admit(self, key: str, now: float) -> Admission:
        from botocore.exceptions import BotoCoreError, ClientError

        cap = config.ocr_daily_cap()
        sec = int(now)
        day_pk = f"DAY#{utc_day(now)}"
        t = self.table
        items = [
            {"ConditionCheck": {
                "TableName": t, "Key": {"pk": {"S": "POLICY#OCR"}},
                "ConditionExpression": "#en = :true AND #ep = :epoch",
                "ExpressionAttributeNames": {"#en": "enabled", "#ep": "contractEpoch"},
                "ExpressionAttributeValues": {":true": {"BOOL": True}, ":epoch": {"N": str(CONTRACT_EPOCH)}},
            }},
            {"Put": {
                "TableName": t,
                "Item": {"pk": {"S": f"REQ#{key}"}, "v": {"N": "3"}, "admittedAt": {"N": str(sec)},
                         "expiresAt": {"N": str(sec + REQ_TTL)}},
                "ConditionExpression": "attribute_not_exists(pk)",
            }},
            {"Update": {
                "TableName": t, "Key": {"pk": {"S": day_pk}},
                "UpdateExpression": "SET #v = :v, #exp = :exp ADD #u :one",
                "ConditionExpression": "attribute_not_exists(pk) OR #u BETWEEN :min AND :max",
                "ExpressionAttributeNames": {"#v": "v", "#exp": "expiresAt", "#u": "used"},
                "ExpressionAttributeValues": {":v": {"N": "3"}, ":exp": {"N": str(day_expiry(now))},
                                              ":one": {"N": "1"}, ":min": {"N": "1"}, ":max": {"N": str(cap - 1)}},
            }},
            {"Put": {
                "TableName": t,
                "Item": {"pk": {"S": f"SEC#{sec}"}, "v": {"N": "3"}, "used": {"N": "1"},
                         "expiresAt": {"N": str(sec + 1 + SEC_GRACE)}},
                "ConditionExpression": "attribute_not_exists(pk)",
            }},
        ]
        try:
            # A fresh private token per invocation: never the public key (two handlers must not both "succeed").
            self._client.transact_write_items(TransactItems=items, ClientRequestToken=str(uuid.uuid4()))
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "TransactionCanceledException":
                reasons = exc.response.get("CancellationReasons") or []
                failed = [(reasons[i].get("Code") if i < len(reasons) else None) == "ConditionalCheckFailed"
                          for i in range(4)]
                if any(failed):
                    raise _denial(failed) from None
            raise unavailable() from None
        except BotoCoreError:
            raise unavailable() from None  # unknown outcome: no dispatch

        used: int | None = None
        try:  # display only; admission is already decided
            row = self._client.get_item(TableName=t, Key={"pk": {"S": day_pk}}, ConsistentRead=True).get("Item")
            used = int(row["used"]["N"]) if row else None
        except Exception:
            pass
        return Admission(used)

    def llm_admit(self, now: float) -> bool:
        return self.daily_admit("LLMDAY", config.llm_daily_cap(), now)

    def translate_admit(self, now: float) -> bool:
        return self.daily_admit("TRDAY", config.translate_daily_cap(), now)

    def daily_admit(self, prefix: str, cap: int, now: float) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._client.update_item(
                TableName=self.table, Key={"pk": {"S": f"{prefix}#{utc_day(now)}"}},
                UpdateExpression="SET #exp = :exp ADD #u :one",
                ConditionExpression="attribute_not_exists(pk) OR #u < :cap",
                ExpressionAttributeNames={"#exp": "expiresAt", "#u": "used"},
                ExpressionAttributeValues={":exp": {"N": str(day_expiry(now))}, ":one": {"N": "1"},
                                           ":cap": {"N": str(cap)}},
            )
            return True
        except ClientError:
            return False  # over cap, or unknown: don't spend
        except Exception:
            return False


_ledger: MemoryLedger | DynamoLedger | None = None
_ledger_lock = threading.Lock()


def get_ledger() -> MemoryLedger | DynamoLedger:
    global _ledger
    with _ledger_lock:
        if _ledger is None:
            kind = config.store_kind()
            if kind == "memory":
                _ledger = MemoryLedger(enabled=config.ocr_enabled_locally())
            elif kind == "dynamodb":
                _ledger = DynamoLedger(config.table_name())
            else:
                raise RuntimeError(f"Unknown STORE={kind!r}")
        return _ledger


def reset_for_tests() -> None:
    global _ledger
    with _ledger_lock:
        _ledger = None
