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
  return text.replace(/\d[\d -]{2,}\d/g, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 4 ? "•".repeat(Math.min(digits.length, 8)) : m;
  });
}
