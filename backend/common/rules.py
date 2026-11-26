"""Deterministic rules engine. It alone decides the tier; the LLM only explains.

Pipeline: normalise -> map synonyms -> match each rule's regexes -> family score (sum of
matched weights, capped at 100) + generic signals + combo bonuses -> tier.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

RULES_DIR = Path(__file__).resolve().parent.parent / "rules"

FAMILIES: tuple[str, ...] = (
    "digital_arrest",
    "customs_courier",
    "kyc_sim",
    "electricity",
    "task_job",
    "collect_qr",
    "investment",
    "relative_trouble",
)
GENERIC = "generic"
SIGNALS = frozenset({"authority", "urgency", "payment", "secrecy"})
LANGS = ("en", "hi", "ta")

LIKELY_SCAM_MIN = 70
SUSPICIOUS_MIN = 35

# Python's \w misses Devanagari/Tamil vowel signs, so word boundaries include those blocks.
_WORD = r"\wऀ-ॿ஀-௿"
LEFT_EDGE = rf"(?<![{_WORD}])"
RIGHT_EDGE = rf"(?![{_WORD}])"

_APOSTROPHES = dict.fromkeys(map(ord, "'‘’`´"), None)
_KEEP_SYMBOLS = {"%"}
_REPEATED_LETTER = re.compile(r"([^\W\d_])\1{2,}")


def _basic_normalise(text: str) -> str:
    """NFC, lowercase, drop apostrophes, punctuation/emoji -> space, collapse 3+ repeated letters."""
    text = unicodedata.normalize("NFC", text).lower().translate(_APOSTROPHES)
    out: list[str] = []
    for ch in text:
        cat = unicodedata.category(ch)
        if ch in _KEEP_SYMBOLS or cat == "Sc":
            out.append(ch)
        elif cat == "Cf" or ch == "️":  # zero-width joiners, variation selectors
            continue
        elif cat[0] == "P" or cat in ("So", "Sk", "Sm", "Cc", "Cs", "Co"):
            out.append(" ")
        else:
            out.append(ch)
    collapsed = _REPEATED_LETTER.sub(r"\1", "".join(out))
    return " ".join(collapsed.split())


@dataclass(frozen=True)
class Rule:
    id: str
    family: str
    weight: int
    patterns: tuple[re.Pattern[str], ...]
    reason: dict[str, str]
    source: str
    signal: str | None = None

    def matches(self, text: str) -> bool:
        return any(p.search(text) for p in self.patterns)


@dataclass(frozen=True)
class Combo:
    id: str
    requires: frozenset[str]
    weight: int
    reason: dict[str, str]
    source: str
    family: str = "combo"


@dataclass
class Verdict:
    tier: str
    score: int
    family: str | None
    matched: list[Rule | Combo] = field(default_factory=list)


def tier_for(score: int) -> str:
    if score >= LIKELY_SCAM_MIN:
        return "likely_scam"
    if score >= SUSPICIOUS_MIN:
        return "suspicious"
    return "no_known_pattern"


class RuleError(ValueError):
    pass


def _check_reason(rule_id: str, reason: object) -> dict[str, str]:
    if not isinstance(reason, dict) or any(not isinstance(reason.get(l), str) or not reason[l] for l in LANGS):
        raise RuleError(f"{rule_id}: reason needs non-empty en, hi and ta")
    return {l: reason[l] for l in LANGS}


class Engine:
    def __init__(self, rules: list[Rule], combos: list[Combo], synonyms: dict[str, str]) -> None:
        self.rules = rules
        self.combos = combos
        self._synonyms = synonyms
        if synonyms:
            alternatives = "|".join(re.escape(v) for v in sorted(synonyms, key=len, reverse=True))
            self._synonym_re: re.Pattern[str] | None = re.compile(f"{LEFT_EDGE}({alternatives}){RIGHT_EDGE}")
        else:
            self._synonym_re = None

    @classmethod
    def load(cls, rules_dir: Path = RULES_DIR) -> "Engine":
        rules: list[Rule] = []
        combos: list[Combo] = []
        synonyms: dict[str, str] = {}
        seen: set[str] = set()

        for path in sorted(rules_dir.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            if path.name == "synonyms.json":
                for canonical, variants in data.items():
                    if canonical.startswith("_"):
                        continue
                    for variant in variants:
                        synonyms[_basic_normalise(variant)] = canonical
                continue
            for raw in data:
                rid = raw["id"]
                if rid in seen:
                    raise RuleError(f"duplicate rule id {rid}")
                seen.add(rid)
                reason = _check_reason(rid, raw.get("reason"))
                source = str(raw.get("source", "")).strip() or "TODO_SOURCE"
                weight = int(raw["weight"])
                if path.name == "combos.json":
                    requires = frozenset(raw["requires"])
                    if not requires <= SIGNALS:
                        raise RuleError(f"{rid}: unknown signal in {sorted(requires - SIGNALS)}")
                    combos.append(Combo(rid, requires, weight, reason, source))
                    continue
                family = raw["family"]
                if family not in FAMILIES and family != GENERIC:
                    raise RuleError(f"{rid}: unknown family {family!r}")
                signal = raw.get("signal")
                if signal is not None and signal not in SIGNALS:
                    raise RuleError(f"{rid}: unknown signal {signal!r}")
                try:
                    patterns = tuple(
                        re.compile(LEFT_EDGE + "(?:" + unicodedata.normalize("NFC", p) + ")") for p in raw["any"]
                    )
                except re.error as exc:
                    raise RuleError(f"{rid}: bad regex: {exc}") from exc
                rules.append(Rule(rid, family, weight, patterns, reason, source, signal))
        return cls(rules, combos, synonyms)

    def normalise(self, text: str) -> str:
        basic = _basic_normalise(text)
        if self._synonym_re is None:
            return basic
        return self._synonym_re.sub(lambda m: self._synonyms[m.group(1)], basic)

    def evaluate(self, normalised: str) -> Verdict:
        by_family: dict[str, list[Rule]] = defaultdict(list)
        generic: list[Rule] = []
        signals: set[str] = set()

        for rule in self.rules:
            if rule.matches(normalised):
                (generic if rule.family == GENERIC else by_family[rule.family]).append(rule)
                if rule.signal:
                    signals.add(rule.signal)

        family_scores = {f: min(100, sum(r.weight for r in rs)) for f, rs in by_family.items()}
        best: str | None = None
        if family_scores:
            best = max(family_scores, key=lambda f: (family_scores[f], -FAMILIES.index(f)))

        combos = [c for c in self.combos if c.requires <= signals]
        family_score = family_scores[best] if best else 0
        score = min(100, family_score + sum(r.weight for r in generic) + sum(c.weight for c in combos))
        tier = tier_for(score)

        if tier == "no_known_pattern":
            # Weak hits (e.g. a real delivery update mentioning "parcel") are not shown as warnings.
            return Verdict(tier, score, None, [])

        matched: list[Rule | Combo] = [*(by_family[best] if best else []), *generic, *combos]
        matched.sort(key=lambda r: (-r.weight, r.id))
        return Verdict(tier, score, best, matched)


@lru_cache(maxsize=1)
def engine() -> Engine:
    return Engine.load()


def normalise(text: str) -> str:
    return engine().normalise(text)


@lru_cache(maxsize=1)
def rules_version() -> str:
    """Short hash of every rules file, so a cached verdict is tied to the rules that made it."""
    files = sorted(RULES_DIR.glob("*.json")) if RULES_DIR.is_dir() else []
    if not files:
        return "none"
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]
