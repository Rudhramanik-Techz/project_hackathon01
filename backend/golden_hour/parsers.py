"""Turn OCR lines from one payment screenshot into ranked, source-linked field candidates (v3).

The server never decides a transaction. It proposes candidates, each with the text it read, the nearby label,
its recognition confidence and its box, and the person confirms or corrects every field in the browser.
Rules: anchored regexes on Latin digits/letters; doubtful readings become warnings, never guesses.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

from common.config import IST, now_ist
from common.ocr import Box, OcrLine

FIELDS = ("amountPaise", "upiRef", "bankRef", "senderVpa", "receiverVpa", "bankName", "occurredAt",
          "direction", "paymentStatus")
MAX_CANDIDATES = 32
LOW_CONFIDENCE = 90.0

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}

_AMOUNT = re.compile(r"(?:₹|\brs\.?|\binr)\s*([0-9]{1,3}(?:,[0-9]{2})*,[0-9]{3}|[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)"
                     r"(?:\.([0-9]{1,2}))?(?![0-9.,])", re.I)
_UTR_LABEL = re.compile(r"\b(utr|upi\s*ref(?:erence)?(?:\.?\s*no)?|upi\s*transaction\s*id|upi\s*txn\s*id|ref(?:erence)?\.?\s*no)\b", re.I)
_BANK_LABEL = re.compile(r"\b(bank\s*ref(?:erence)?(?:\.?\s*no)?|transaction\s*id|txn\s*id|order\s*id|google\s*transaction\s*id)\b", re.I)
_DIGIT_RUN = re.compile(r"(?<![0-9A-Za-z])([0-9](?:[0-9 ]{8,18})[0-9])(?![0-9A-Za-z])")
_TOKEN = re.compile(r"(?<![0-9A-Za-z])([A-Za-z0-9]{6,35})(?![0-9A-Za-z])")
_VPA = re.compile(r"(?<![\w.\-])([a-z0-9][a-z0-9.\-_]{1,255})@([a-z][a-z]{1,63})(?![a-z.])", re.I)
_FROM = re.compile(r"\b(from|debited\s+from|sender)\b", re.I)
_DATE_PATTERNS = [
    re.compile(r"\b(?P<d>\d{1,2})(?:st|nd|rd|th)?\s+(?P<mon>[a-z]{3,9})\.?,?\s*(?P<y>\d{4})\b", re.I),
    re.compile(r"\b(?P<mon>[a-z]{3,9})\.?\s+(?P<d>\d{1,2}),?\s*(?P<y>\d{4})\b", re.I),
    re.compile(r"\b(?P<y>\d{4})-(?P<m>\d{1,2})-(?P<d>\d{1,2})\b"),
    re.compile(r"\b(?P<d>\d{1,2})[/\-.](?P<m>\d{1,2})[/\-.](?P<y>\d{4})\b"),
]
_TIME = re.compile(r"\b(?P<h>\d{1,2}):(?P<min>\d{2})(?::(?P<s>\d{2}))?\s*(?P<ap>[ap]\.?\s?m\.?)?(?![0-9])", re.I)

_DIRECTION = [
    (re.compile(r"\b(paid\s+to|sent\s+to|payment\s+to|debited|transferred\s+to)\b|भुगतान\s+किया|भेजे\s+गए", re.I), "outgoing"),
    (re.compile(r"\b(received\s+from|credited|money\s+received)\b|प्राप्त\s+हुए", re.I), "incoming"),
]
_STATUS = [
    (re.compile(r"\b(completed|successful|success|paid\s+successfully|payment\s+successful|transaction\s+successful)\b|पूरा\s+हुआ|सफल", re.I), "completed"),
    (re.compile(r"\b(pending|processing|in\s+progress)\b", re.I), "pending"),
    (re.compile(r"\b(failed|declined|unsuccessful)\b|विफल", re.I), "failed"),
    (re.compile(r"\b(refunded|reversed|refund\s+processed)\b", re.I), "reversed"),
]
_BANKS = [
    (re.compile(r"state\s+bank\s+of\s+india|\bsbi\b", re.I), "State Bank of India"),
    (re.compile(r"hdfc\s+bank|\bhdfc\b", re.I), "HDFC Bank"),
    (re.compile(r"icici\s+bank|\bicici\b", re.I), "ICICI Bank"),
    (re.compile(r"axis\s+bank", re.I), "Axis Bank"),
    (re.compile(r"kotak", re.I), "Kotak Mahindra Bank"),
    (re.compile(r"punjab\s+national\s+bank|\bpnb\b", re.I), "Punjab National Bank"),
    (re.compile(r"bank\s+of\s+baroda", re.I), "Bank of Baroda"),
    (re.compile(r"canara\s+bank", re.I), "Canara Bank"),
    (re.compile(r"union\s+bank\s+of\s+india", re.I), "Union Bank of India"),
    (re.compile(r"idfc\s+first", re.I), "IDFC FIRST Bank"),
    (re.compile(r"yes\s+bank", re.I), "Yes Bank"),
    (re.compile(r"indusind", re.I), "IndusInd Bank"),
    (re.compile(r"federal\s+bank", re.I), "Federal Bank"),
    (re.compile(r"india\s+post\s+payments\s+bank", re.I), "India Post Payments Bank"),
    (re.compile(r"paytm\s+payments\s+bank", re.I), "Paytm Payments Bank"),
]


@lru_cache(maxsize=1)
def psp_handles() -> frozenset[str]:
    data = json.loads((Path(__file__).resolve().parent / "psp_handles.json").read_text(encoding="utf-8"))
    return frozenset(h.lower() for h in data["handles"])


@dataclass
class Candidate:
    field: str
    raw: str          # what was read, as text
    value: str        # canonical value the browser proposes (paise digits, ISO time, enum, ID string)
    label: str        # nearby label that explains the reading ("" if none)
    confidence: float  # 0-100 recognition confidence of the source line
    box: Box
    priority: int = 1  # lower ranks first within a field
    id: str = ""

    def to_dict(self) -> dict:
        return {"id": self.id, "field": self.field, "raw": self.raw[:128], "value": self.value[:128],
                "label": self.label[:64], "confidenceBp": max(0, min(10000, round(self.confidence * 100))),
                "box": box_bp(self.box)}


def box_bp(box: Box) -> list[int]:
    """[left, top, right, bottom] in basis points, rounded outward and clamped; never degenerate."""
    left = max(0, min(10000, math.floor(box[0] * 10000)))
    top = max(0, min(10000, math.floor(box[1] * 10000)))
    right = max(0, min(10000, math.ceil(box[2] * 10000)))
    bottom = max(0, min(10000, math.ceil(box[3] * 10000)))
    if right <= left:
        right = min(10000, left + 1) if left < 10000 else 10000
        left = right - 1
    if bottom <= top:
        bottom = min(10000, top + 1) if top < 10000 else 10000
        top = bottom - 1
    return [left, top, right, bottom]


def union(a: Box, b: Box) -> Box:
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def parse_paise(integer: str, fraction: str | None) -> int:
    paise = int(integer.replace(",", "")) * 100
    if fraction:
        paise += int(fraction.ljust(2, "0"))
    return paise


def _label_near(lines: list[OcrLine], i: int) -> str:
    """A short previous line usually labels the value on this line (e.g. 'UPI transaction ID' above the digits)."""
    prev = lines[i - 1].text if i > 0 else ""
    if prev and len(prev) <= 40 and "@" not in prev and not any(ch.isdigit() for ch in prev):
        return lines[i - 1].text.strip()
    return ""


def _amounts(lines: list[OcrLine]) -> list[Candidate]:
    out = []
    for i, line in enumerate(lines):
        for m in _AMOUNT.finditer(line.text):
            paise = parse_paise(m.group(1), m.group(2))
            if not 1 <= paise <= 999_999_999_999:
                continue
            standalone = len(line.text.strip()) <= len(m.group(0)) + 2
            label = _label_near(lines, i) if standalone else line.text[: m.start()].strip()[:64]
            out.append(Candidate("amountPaise", m.group(0), str(paise), label, line.confidence, line.box,
                                 0 if standalone else 1))
    return out


def _digit_runs(text: str) -> list[str]:
    return [m.group(1).replace(" ", "") for m in _DIGIT_RUN.finditer(text)]


def _refs(lines: list[OcrLine]) -> list[Candidate]:
    out: list[Candidate] = []
    claimed: set[int] = set()  # line indexes whose value was taken by a label
    for i, line in enumerate(lines):
        for label_re, kind in ((_UTR_LABEL, "upi"), (_BANK_LABEL, "bank")):
            m = label_re.search(line.text)
            if not m or (kind == "bank" and _UTR_LABEL.search(line.text)):
                continue
            label = m.group(0)
            windows = [(i, line.text[m.end():])] + [(j, lines[j].text) for j in range(i + 1, min(i + 3, len(lines)))]
            for j, text in windows:
                runs = [r for r in _digit_runs(text) if len(r) == 12]
                if kind == "upi" and runs:
                    out.append(Candidate("upiRef", runs[0], runs[0], label, lines[j].confidence, lines[j].box, 0))
                    claimed.add(j)
                    break
                if kind == "upi":
                    if _digit_runs(text):  # a number under a UPI label that is not 12 digits: offer nothing
                        break
                    continue
                tok = _TOKEN.search(text)
                if tok and not tok.group(1).isalpha():
                    value = tok.group(1)
                    if kind == "bank":
                        if value.isdigit() and len(value) == 12:  # an Order ID that looks like a UTR: offer both
                            out.append(Candidate("upiRef", value, value, label, lines[j].confidence, lines[j].box, 2))
                        # A merchant "Order ID" is a weaker bank-reference candidate than a "Bank Ref"/"Transaction ID".
                        rank = 1 if label.lower().startswith("order") else 0
                        out.append(Candidate("bankRef", value, value, label, lines[j].confidence, lines[j].box, rank))
                    claimed.add(j)
                    break
    for i, line in enumerate(lines):  # unlabelled 12-digit numbers: weakest UPI candidates
        if i in claimed:
            continue
        for run in _digit_runs(line.text):
            if len(run) == 12:
                out.append(Candidate("upiRef", run, run, "", line.confidence, line.box, 3))
    return out


def _vpas(lines: list[OcrLine]) -> list[Candidate]:
    out = []
    for i, line in enumerate(lines):
        context = (lines[i - 1].text + " " if i else "") + line.text
        for m in _VPA.finditer(line.text):
            vpa = f"{m.group(1)}@{m.group(2)}".lower()
            sender = bool(_FROM.search(line.text) or (i and _FROM.search(lines[i - 1].text) and not _VPA.search(lines[i - 1].text)))
            unknown_handle = m.group(2).lower() not in psp_handles()
            label = "unfamiliar handle" if unknown_handle else _label_near(lines, i)
            out.append(Candidate("senderVpa" if sender else "receiverVpa", m.group(0), vpa, label[:64],
                                 line.confidence, line.box, 0 if re.search(r"\bto\b|paid", context, re.I) else 1))
    return out


def _parse_date(text: str) -> tuple[int, int, int] | None:
    for pattern in _DATE_PATTERNS:
        for m in pattern.finditer(text):
            g = m.groupdict()
            if g.get("mon"):
                month = MONTHS.get(g["mon"][:3].lower())
                if not month:
                    continue
            else:
                month = int(g["m"])
            day, year = int(g["d"]), int(g["y"])
            if 1 <= month <= 12 and 1 <= day <= 31:
                return day, month, year
    return None


def _parse_time(text: str) -> tuple[int, int, int | None] | None:
    for m in _TIME.finditer(text):
        hour, minute = int(m.group("h")), int(m.group("min"))
        second = int(m.group("s")) if m.group("s") else None
        ampm = (m.group("ap") or "").lower().replace(".", "").replace(" ", "")
        if ampm == "pm" and hour < 12:
            hour += 12
        elif ampm == "am" and hour == 12:
            hour = 0
        if hour < 24 and minute < 60 and (second is None or second < 60):
            return hour, minute, second
    return None


def _times(lines: list[OcrLine], now: datetime) -> list[Candidate]:
    out = []
    for i, line in enumerate(lines):
        date = _parse_date(line.text)
        if not date:
            continue
        clock, box, conf, raw = _parse_time(line.text), line.box, line.confidence, line.text
        if not clock:
            for j in (i + 1, i - 1):
                if 0 <= j < len(lines) and (clock := _parse_time(lines[j].text)):
                    box, conf, raw = union(box, lines[j].box), min(conf, lines[j].confidence), f"{line.text} {lines[j].text}"
                    break
        if not clock:
            continue  # a date without a time is evidence only; never invent the time
        (day, month, year), (hour, minute, second) = date, clock
        try:
            dt = datetime(year, month, day, hour, minute, second or 0, tzinfo=IST)
        except ValueError:
            continue
        value = dt.isoformat() if second is not None else dt.isoformat(timespec="minutes")
        future = dt > now + timedelta(minutes=5)
        out.append(Candidate("occurredAt", raw.strip(), value, "time in the future" if future else "",
                             conf, box, 2 if future else 0))
    return out


def _enums(lines: list[OcrLine]) -> list[Candidate]:
    out = []
    for line in lines:
        for field_name, table in (("direction", _DIRECTION), ("paymentStatus", _STATUS)):
            for pattern, value in table:
                m = pattern.search(line.text)
                if m:
                    out.append(Candidate(field_name, m.group(0), value, "", line.confidence, line.box, 0))
        for pattern, name in _BANKS:
            if pattern.search(line.text):
                label = "your bank?" if _FROM.search(line.text) else ""
                out.append(Candidate("bankName", line.text.strip(), name, label, line.confidence, line.box,
                                     0 if label else 1))
                break
    return out


@dataclass
class Extraction:
    candidates: list[Candidate] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def best(self, field_name: str) -> str | None:
        for c in self.candidates:
            if c.field == field_name:
                return c.value
        return None


def extract(lines: list[OcrLine], now: datetime | None = None) -> Extraction:
    now = now or now_ist()
    lines = [l for l in lines if l.text.strip()]
    found = _amounts(lines) + _refs(lines) + _vpas(lines) + _times(lines, now) + _enums(lines)

    # Canonical de-duplication: same field + value keeps the best-ranked reading.
    found.sort(key=lambda c: (FIELDS.index(c.field), c.priority, -c.confidence, c.box[1], c.box[0], c.raw))
    unique: list[Candidate] = []
    seen: set[tuple[str, str]] = set()
    for c in found:
        if (c.field, c.value) not in seen:
            seen.add((c.field, c.value))
            unique.append(c)

    warnings: list[str] = []
    per_field = {f: [c for c in unique if c.field == f] for f in FIELDS}
    if len(per_field["amountPaise"]) > 1:
        warnings.append("multiple_amounts")
    if len(per_field["upiRef"]) > 1:
        warnings.append("multiple_refs")
    if any(c.priority >= 3 for c in per_field["upiRef"][:1]):
        warnings.append("ambiguous_label")
    if any(c.confidence < LOW_CONFIDENCE for c in unique):
        warnings.append("low_confidence")
    if unique and not per_field["amountPaise"] and not per_field["upiRef"]:
        warnings.append("possible_crop")
    if len(unique) > MAX_CANDIDATES:
        warnings.append("truncated_candidates")
        unique = unique[:MAX_CANDIDATES]
    for n, c in enumerate(unique, start=1):
        c.id = f"c{n}"
    return Extraction(unique, warnings)
