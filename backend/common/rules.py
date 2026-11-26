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


# A sentence that only warns people off ("police never arrest on a video call", "never share your OTP")
# is removed before matching, so genuine advice is not scored as the scam it describes.
# frontend/src/lib/checker.ts holds the same patterns; tests/test_parity.py keeps the two in step.
_PROTECTIVE = tuple(
    re.compile(p, re.ASCII)
    for p in (
        # Every pattern must reach the end of the sentence within a short tail, so a threat that follows the
        # warning in the same sentence keeps the sentence.
        r"^[^,;]{0,40}\b(police|cbi|ed|bank|banks|rbi|sbi|officials?|officers?|government|govt|agency|agencies|courts?|we)\b"
        r"[^,;:]{0,60}\bnever\b[^,;:]{0,20}\b(arrests?|asks?|calls?|questions?|demands?|requests?)\b[^,;:—]{0,45}$",
        r"^(please )?(do not|dont|never) (share|disclose|reveal|give|send|transfer|pay|click)\b"
        r"[^,;:]{0,40}\b(otp|pin|cvv|password|money|links?|card details|bank details|account details)\b[^,;:]{0,30}$",
        r"(otp|pin|cvv|ओटीपी|पिन|पासवर्ड)[^,;:]{0,40}(साझा (न|ना|नहीं) करें|शेयर (न|ना|नहीं) करें|(न|ना|मत) बता)[^,;:]{0,12}$",
        r"(पुलिस|सीबीआई|बैंक|आरबीआई)[^,;:]{0,60}(कभी|वीडियो कॉल पर)[^,;:]{0,60}नहीं (करती|करता|करते|मांगती|मांगता|मांगते|माँगती|माँगता|माँगते)[^,;:]{0,15}$",
        r"(otp|pin|cvv|ஓடிபி)[^,;:]{0,40}(பகிர வேண்டாம்|பகிராதீர்கள்|சொல்ல வேண்டாம்)[^,;:]{0,12}$",
        r"(காவல்துறை|போலீஸ்|வங்கி|சிபிஐ)[^,;:]{0,60}ஒருபோதும்[^,;:]{0,60}(மாட்டார்கள்|மாட்டாது)[^,;:]{0,15}$",
    )
)
# Standard advisories, matched as complete sentences with no room for anything else, so words such as
# "immediately" are allowed in them.
_SAFE_SENTENCES = tuple(
    re.compile(p, re.ASCII)
    for p in (
        r"^([a-z0-9 ]{0,30}\b(advisory|warns?|warning|alert|reminder|fraud|remember) ?: ?)?(the )?(police|cbi|ed|rbi|government|govt|law enforcement)( and (the )?(police|cbi|ed))?( officers?| officials?| agencies)? (never|do not|does not|dont|doesnt|will not|wont|cannot|cant|will never|can never) arrests? ((anyone|people|citizens|you) )?(over|on|through|via|by) (a )?(video|phone|audio|whatsapp|skype)( or (video|phone))? ?calls?[.!]*$",
        r"^([a-z0-9 ]{0,30}\b(advisory|warns?|warning|alert|reminder|fraud|remember) ?: ?)?(there is no such thing as (a )?digital arrest|there is no digital arrest|digital arrest (is not real|does not exist|is fake|is a scam))( in (india|law|indian law))?[.!]*$",
        r"^(please )?(report (such|these|this|suspicious|fraud)( calls?| messages?)? (to|on|at)|call|dial) 1930( or (visit )?(www\.)?cybercrime\.gov\.in)?( immediately| at once| now| right away)?[.!]*$",
    )
)
# Anything that turns a warning back into an instruction keeps the whole sentence.
_NOT_PROTECTIVE = re.compile(
    r"\b(but|otherwise|unless|until|instead|only|except|else|if|however|so|therefore|because|now|immediately|urgently|pay|face)\b"
    r"|\byou (are|have)\b|\bwarrant is\b|\bunder arrest\b|\bstay on\b|\bwill be (arrested|blocked|disconnected|frozen)\b|https?|www\."
    r"|[0-9०-९௦-௯]{6,}"
    r"|लेकिन|वरना|नहीं तो|सिवाय|केवल|सिर्फ|तुरंत|ट्रांसफर|भेज|रहें|ஆனால்|இல்லையெனில்|தவிர|மட்டும்|உடனே|அனுப்ப|இருங்கள்",
    re.ASCII,
)
_SENTENCE_END = re.compile(r"(?<=[.!?।])\s+|\n+")


def _drop_warnings(text: str) -> str:
    sentences = _SENTENCE_END.split(unicodedata.normalize("NFC", text))
    kept: list[str] = []
    for sentence in sentences:
        low = sentence.lower().translate(_APOSTROPHES).strip()
        if not any(p.search(low) for p in _SAFE_SENTENCES) and (
            _NOT_PROTECTIVE.search(low) or not any(p.search(low) for p in _PROTECTIVE)
        ):
            kept.append(sentence)
    return text if len(kept) == len(sentences) else " ".join(kept)


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
        stripped = _drop_warnings(text)
        if stripped is text:
            return self._normalise_whole(text)
        remainder = self._normalise_whole(stripped)
        # Warnings are dropped only when nothing else in the message scores; a warning placed in front of a
        # threat must never lower its score.
        return self._normalise_whole(text) if self.evaluate(remainder).score > 0 else remainder

    def _normalise_whole(self, text: str) -> str:
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
