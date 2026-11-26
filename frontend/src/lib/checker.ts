// Deterministic scam checker, running in the browser (v3): the message never leaves the phone.
// Same algorithm and the same backend/rules/*.json as backend/common/rules.py; tests/test_parity.py
// checks both engines give identical results.

export const FAMILIES = [
  "digital_arrest",
  "customs_courier",
  "kyc_sim",
  "electricity",
  "task_job",
  "collect_qr",
  "investment",
  "relative_trouble",
] as const;
export type Family = (typeof FAMILIES)[number];
export type Tier = "likely_scam" | "suspicious" | "no_known_pattern";
type Lang = "en" | "hi" | "ta";

export const MAX_SCALARS = 2000;
const LIKELY_MIN = 70;
const SUSPICIOUS_MIN = 35;
const SIGNALS = new Set(["authority", "urgency", "payment", "secrecy"]);

// Python's \w is Unicode-aware; JS needs \p{L}\p{N}. Devanagari/Tamil vowel signs are added explicitly.
const WORD = "\\p{L}\\p{N}_\\u0900-\\u097F\\u0B80-\\u0BFF";
const LEFT_EDGE = `(?<![${WORD}])`;
const RIGHT_EDGE = `(?![${WORD}])`;

interface RawRule {
  id: string;
  family?: string;
  weight: number;
  any?: string[];
  requires?: string[];
  signal?: string;
  reason: Record<Lang, string>;
  source?: string;
}

export interface Rule {
  id: string;
  family: string;
  weight: number;
  patterns: RegExp[];
  reason: Record<Lang, string>;
  source: string;
  signal: string | null;
}

export interface Combo {
  id: string;
  requires: Set<string>;
  weight: number;
  reason: Record<Lang, string>;
  source: string;
}

export interface Verdict {
  tier: Tier;
  score: number;
  family: Family | null;
  matched: (Rule | Combo)[];
}

const isCombo = (m: Rule | Combo): m is Combo => "requires" in m;

function basicNormalise(text: string): string {
  let t = text.normalize("NFC").toLowerCase().replace(/['‘’`´]/g, "");
  let out = "";
  for (const ch of t) {
    if (ch === "%" || /\p{Sc}/u.test(ch)) out += ch;
    else if (/\p{Cf}/u.test(ch) || ch === "️") continue;
    else if (/[\p{P}\p{So}\p{Sk}\p{Sm}\p{Cc}\p{Cs}\p{Co}]/u.test(ch)) out += " ";
    else out += ch;
  }
  t = out.replace(/(\p{L})\1{2,}/gu, "$1");
  return t.split(/\s+/u).filter(Boolean).join(" ");
}

// Same patterns as backend/common/rules.py: a sentence that only warns people off is removed before matching.
// Every pattern must reach the end of the sentence within a short tail, so a threat that follows the warning
// in the same sentence keeps the sentence.
const PROTECTIVE: RegExp[] = [
  /^[^,;]{0,40}\b(police|cbi|ed|bank|banks|rbi|sbi|officials?|officers?|government|govt|agency|agencies|courts?|we)\b[^,;:]{0,60}\bnever\b[^,;:]{0,20}\b(arrests?|asks?|calls?|questions?|demands?|requests?)\b[^,;:—]{0,45}$/u,
  /^(please )?(do not|dont|never) (share|disclose|reveal|give|send|transfer|pay|click)\b[^,;:]{0,40}\b(otp|pin|cvv|password|money|links?|card details|bank details|account details)\b[^,;:]{0,30}$/u,
  /(otp|pin|cvv|ओटीपी|पिन|पासवर्ड)[^,;:]{0,40}(साझा (न|ना|नहीं) करें|शेयर (न|ना|नहीं) करें|(न|ना|मत) बता)[^,;:]{0,12}$/u,
  /(पुलिस|सीबीआई|बैंक|आरबीआई)[^,;:]{0,60}(कभी|वीडियो कॉल पर)[^,;:]{0,60}नहीं (करती|करता|करते|मांगती|मांगता|मांगते|माँगती|माँगता|माँगते)[^,;:]{0,15}$/u,
  /^(no|none of the) (real |genuine )?(government|govt|police|cbi|bank|banks|rbi|agency|agencies|officials?|officers?)( agency| agencies| department| officers?| officials?)? (ever |will ever |will )?(asks?|demands?|tells?|calls?)\b[^,;:—]{0,60}$/u,
  /(otp|pin|cvv|ஓடிபி)[^,;:]{0,40}(பகிர வேண்டாம்|பகிராதீர்கள்|சொல்ல வேண்டாம்)[^,;:]{0,12}$/u,
  /(காவல்துறை|போலீஸ்|வங்கி|சிபிஐ)[^,;:]{0,120}(மாட்டார்கள்|மாட்டாது)[^,;:]{0,15}$/u,
];
// Standard advisories, matched as complete sentences with no room for anything else.
const SAFE_SENTENCES: RegExp[] = [
  /^([a-z0-9 ]{0,30}\b(advisory|warns?|warning|alert|reminder|fraud|remember) ?: ?)?(the )?(police|cbi|ed|rbi|government|govt|law enforcement)( and (the )?(police|cbi|ed))?( officers?| officials?| agencies)? (never|do not|does not|dont|doesnt|will not|wont|cannot|cant|will never|can never) arrests? ((anyone|people|citizens|you) )?(over|on|through|via|by) (a )?(video|phone|audio|whatsapp|skype)( or (video|phone))? ?calls?[.!]*$/u,
  /^([a-z0-9 ]{0,30}\b(advisory|warns?|warning|alert|reminder|fraud|remember) ?: ?)?(there is no such thing as (a )?digital arrest|there is no digital arrest|digital arrest (is not real|does not exist|is (a )?(fake|scam|fraud|hoax|myth)))( in (india|law|indian law))?[.!]*$/u,
  /^(beware|be aware|be careful|be alert|stay alert|stay safe|watch out)( of| from| against| for)? (the )?(fake )?digital arrest( calls?| scams?| frauds?| cases?)*[.!]*$/u,
  /^(please )?(report (such|these|this|suspicious|fraud)( calls?| messages?)? (to|on|at)|call|dial) 1930( or (visit )?(www\.)?cybercrime\.gov\.in)?( immediately| at once| now| right away)?[.!]*$/u,
];
// Anything that turns a warning back into an instruction keeps the whole sentence.
const NOT_PROTECTIVE =
  /\b(but|otherwise|unless|until|instead|only|except|else|if|however|so|therefore|because|now|immediately|urgently|pay|face)\b|\byou (are|have)\b|\bwarrant is\b|\bunder arrest\b|\bstay on\b|\bwill be (arrested|blocked|disconnected|frozen)\b|https?|www\.|[0-9०-९௦-௯]{6,}|लेकिन|वरना|नहीं तो|सिवाय|केवल|सिर्फ|तुरंत|ट्रांसफर|भेज|रहें|ஆனால்|இல்லையெனில்|தவிர|மட்டும்|உடனே|அனுப்ப|இருங்கள்/u;
const SENTENCE_END = /(?<=[.!?।])\s+|\n+/u;

function dropWarnings(text: string): string {
  const sentences = text.normalize("NFC").split(SENTENCE_END);
  const kept = sentences.filter((sentence) => {
    const low = sentence.toLowerCase().replace(/['‘’`´]/g, "").trim();
    if (SAFE_SENTENCES.some((p) => p.test(low))) return false;
    return NOT_PROTECTIVE.test(low) || !PROTECTIVE.some((p) => p.test(low));
  });
  return kept.length === sentences.length ? text : kept.join(" ");
}

export class Engine {
  readonly rules: Rule[] = [];
  readonly combos: Combo[] = [];
  private synonyms = new Map<string, string>();
  private synonymRe: RegExp | null = null;

  /** files: { "digital_arrest.json": [...], "synonyms.json": {...}, ... } */
  constructor(files: Record<string, unknown>) {
    const seen = new Set<string>();
    for (const name of Object.keys(files).sort()) {
      const data = files[name];
      if (name === "synonyms.json") {
        for (const [canonical, variants] of Object.entries(data as Record<string, unknown>)) {
          if (canonical.startsWith("_")) continue;
          for (const v of variants as string[]) this.synonyms.set(basicNormalise(v), canonical);
        }
        continue;
      }
      for (const raw of data as RawRule[]) {
        if (seen.has(raw.id)) throw new Error(`duplicate rule id ${raw.id}`);
        seen.add(raw.id);
        const source = (raw.source ?? "").trim() || "TODO_SOURCE";
        if (name === "combos.json") {
          this.combos.push({ id: raw.id, requires: new Set(raw.requires), weight: raw.weight, reason: raw.reason, source });
          continue;
        }
        if (raw.signal && !SIGNALS.has(raw.signal)) throw new Error(`${raw.id}: unknown signal`);
        this.rules.push({
          id: raw.id,
          family: raw.family ?? "generic",
          weight: raw.weight,
          patterns: (raw.any ?? []).map((p) => new RegExp(`${LEFT_EDGE}(?:${p.normalize("NFC")})`, "u")),
          reason: raw.reason,
          source,
          signal: raw.signal ?? null,
        });
      }
    }
    if (this.synonyms.size) {
      const alts = [...this.synonyms.keys()]
        .sort((a, b) => b.length - a.length)
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      this.synonymRe = new RegExp(`${LEFT_EDGE}(${alts})${RIGHT_EDGE}`, "gu");
    }
  }

  normalise(text: string): string {
    const stripped = dropWarnings(text);
    if (stripped === text) return this.normaliseWhole(text);
    const remainder = this.normaliseWhole(stripped);
    // Warnings are dropped only when nothing else in the message scores; a warning placed in front of a
    // threat must never lower its score.
    return this.evaluate(remainder).score > 0 ? this.normaliseWhole(text) : remainder;
  }

  private normaliseWhole(text: string): string {
    const basic = basicNormalise(text);
    return this.synonymRe ? basic.replace(this.synonymRe, (_m, g: string) => this.synonyms.get(g) ?? g) : basic;
  }

  evaluate(normalised: string): Verdict {
    const byFamily = new Map<string, Rule[]>();
    const generic: Rule[] = [];
    const signals = new Set<string>();
    for (const rule of this.rules) {
      if (!rule.patterns.some((p) => p.test(normalised))) continue;
      if (rule.family === "generic") generic.push(rule);
      else byFamily.set(rule.family, [...(byFamily.get(rule.family) ?? []), rule]);
      if (rule.signal) signals.add(rule.signal);
    }
    let best: Family | null = null;
    let bestScore = 0;
    for (const fam of FAMILIES) {
      const rs = byFamily.get(fam);
      if (!rs) continue;
      const s = Math.min(100, rs.reduce((a, r) => a + r.weight, 0));
      if (s > bestScore) {
        best = fam;
        bestScore = s; // strict ">" keeps the earlier family on ties (fixed tie order)
      }
    }
    const combos = this.combos.filter((c) => [...c.requires].every((s) => signals.has(s)));
    const score = Math.min(
      100,
      bestScore + generic.reduce((a, r) => a + r.weight, 0) + combos.reduce((a, c) => a + c.weight, 0),
    );
    const tier: Tier = score >= LIKELY_MIN ? "likely_scam" : score >= SUSPICIOUS_MIN ? "suspicious" : "no_known_pattern";
    if (tier === "no_known_pattern") return { tier, score, family: null, matched: [] };
    const matched: (Rule | Combo)[] = [...(best ? byFamily.get(best) ?? [] : []), ...generic, ...combos];
    matched.sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { tier, score, family: best, matched };
  }

  check(text: string): Verdict {
    return this.evaluate(this.normalise(text));
  }
}

export { isCombo };

/** Cheap guard before any normalisation or regex work (v3 R3-A19): reject > 2N UTF-16 units, then count scalars. */
export function withinLimit(text: string, max = MAX_SCALARS): boolean {
  if (text.length > 2 * max) return false;
  let n = 0;
  for (const _ of text) if (++n > max) return false;
  return true;
}

/** Hide numbers that could be OTPs, PINs, card or account numbers before a message becomes evidence. */
export function redact(text: string): string {
  // \p{Nd} covers Devanagari, Tamil and every other script's digits, not just 0-9.
  return text.replace(/\p{Nd}[\p{Nd} -]{2,}\p{Nd}/gu, (m) => {
    const digits = m.replace(/\P{Nd}/gu, "");
    return digits.length >= 4 ? "•".repeat(Math.min(digits.length, 8)) : m;
  });
}
