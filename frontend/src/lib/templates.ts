// Reviewed, hand-written explanations (en/hi/ta). Always shown first; the optional AI text only replaces them.
import type { Lang } from "../i18n";
import table from "../i18n/templates.json";
import type { Tier } from "./checker";

type LangTable = { likely_scam: string; suspicious: string; no_known_pattern: string; family: Record<string, string> };

/** Empty for a language without reviewed wording, so English is never dropped into another language. */
export function templateExplanation(tier: Tier, family: string | null, reasons: string[], lang: Lang): string {
  const t = (table as Record<string, LangTable>)[lang];
  if (!t) return "";
  if (tier === "no_known_pattern") return t.no_known_pattern;
  const fam = t.family[family ?? "_unknown"] ?? t.family._unknown ?? "";
  return t[tier].replace("{family}", fam).replace("{reasons}", reasons.slice(0, 2).join(" ")).trim();
}
