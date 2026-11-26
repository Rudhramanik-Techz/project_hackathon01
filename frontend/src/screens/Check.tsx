// Scam checker running on the phone (v3). The message is never sent anywhere. The optional AI wording gets
// only the verdict and rule IDs. "Already sent money?" is offered at every tier.
import { useEffect, useState } from "react";
import { postExplain } from "../api";
import { AlertIcon, ExternalIcon, FileIcon, LockIcon, SearchIcon, ShieldIcon } from "../components/Icons";
import { isCombo, MAX_SCALARS, redact, withinLimit, type Verdict } from "../lib/checker";
import { engine } from "../lib/rules";
import { templateExplanation } from "../lib/templates";
import { useLang, useT } from "../i18n";
import samples from "../samples/samples.json";

export type CheckSampleKey = "digitalArrest" | "courier" | "genuine";

const TIER_STYLE = {
  likely_scam: { box: "border-red-600 bg-red-50 text-red-950", badge: "bg-red-700 text-white" },
  suspicious: { box: "border-amber-500 bg-amber-50 text-amber-950", badge: "bg-amber-500 text-white" },
  no_known_pattern: { box: "border-slate-300 bg-white text-slate-950", badge: "bg-slate-100 text-slate-950" },
} as const;

export function Check({ sample, onHandoff }: { sample: CheckSampleKey | null; onHandoff: (evidence: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [text, setText] = useState(sample ? samples.check[sample] : "");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState("");
  const [ai, setAi] = useState<{ state: "idle" | "loading" | "done"; text: string; lang: string }>({ state: "idle", text: "", lang });
  const [withEvidence, setWithEvidence] = useState(false);

  const run = (value = text) => {
    setError("");
    if (!value.trim()) return setError(t("checkEmpty"));
    if (!withinLimit(value)) return setError(t("checkTooLong"));
    setVerdict(engine.check(value));
    setAi({ state: "idle", text: "", lang });
  };

  useEffect(() => {
    if (sample) run(samples.check[sample]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Optional friendlier wording from Bedrock: only tier, family and rule IDs leave the phone.
  useEffect(() => {
    if (!verdict || verdict.tier === "no_known_pattern" || !navigator.onLine) return;
    let live = true;
    setAi({ state: "loading", text: "", lang });
    void postExplain({ lang, tier: verdict.tier, family: verdict.family, ruleIds: verdict.matched.map((m) => m.id) }).then((r) => {
      if (live) setAi({ state: "done", text: r ?? "", lang });
    });
    return () => {
      live = false;
    };
  }, [verdict, lang]);

  const reasons = verdict ? verdict.matched.map((m) => m.reason[lang]) : [];
  const template = verdict ? templateExplanation(verdict.tier, verdict.family, reasons, lang) : "";
  const redacted = redact(text.trim());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("checkTitle")}</h1>
        <p className="mt-1 text-slate-600">{t("checkRules")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* input */}
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <label className="text-sm font-semibold text-slate-950" htmlFor="check-text">{t("checkPlaceholder")}</label>
          <textarea
            id="check-text"
            value={text}
            rows={9}
            onChange={(e) => {
              const v = e.target.value;
              if (v.length > 2 * MAX_SCALARS) return setError(t("checkTooLong")); // keep the previous text
              setText(v);
              setVerdict(null);
            }}
            className="w-full rounded-lg border border-slate-300 p-3 text-base"
          />
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><LockIcon size={14} />{t("checkLocalNote")}</span>
            <span className="tabular-nums">{[...text].length}/{MAX_SCALARS}</span>
          </div>
          <button type="button" onClick={() => run()}
            className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-900 text-base font-semibold text-white">
            <SearchIcon size={18} />{t("checkButton")}
          </button>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </section>

        {/* result */}
        {!verdict ? (
          <section className="hidden min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center lg:flex">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-800"><ShieldIcon size={24} /></span>
            <p className="mt-3 max-w-xs text-sm text-slate-500">{t("checkResultEmpty")}</p>
          </section>
        ) : (
          <section aria-live="polite" className={`rounded-xl border-l-4 border p-4 shadow-sm sm:p-5 ${TIER_STYLE[verdict.tier].box}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${TIER_STYLE[verdict.tier].badge}`}>
                {verdict.tier === "no_known_pattern" ? <ShieldIcon size={16} /> : <AlertIcon size={16} />}
                {verdict.tier === "likely_scam" ? t("tierLikely") : verdict.tier === "suspicious" ? t("tierSuspicious") : t("tierNone")}
              </span>
              {verdict.tier !== "no_known_pattern" && <span className="text-sm font-semibold tabular-nums opacity-80">{verdict.score}/100</span>}
            </div>

            <p className="mt-3 leading-relaxed">{template}</p>
            {verdict.tier === "no_known_pattern" && <p className="mt-1 text-sm opacity-80">{t("tierNoneSub")}</p>}
            {ai.state === "loading" && <p className="mt-2 text-sm opacity-70">{t("aiWriting")}</p>}
            {ai.state === "done" && ai.text && ai.lang === lang && (
              <div className="mt-3 rounded-lg bg-white/80 p-3">
                <p>{ai.text}</p>
                <p className="mt-1 text-xs opacity-70">{t("aiLabel")}</p>
              </div>
            )}

            {verdict.matched.length > 0 && (
              <>
                <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide opacity-80">{t("whyTitle")}</h2>
                <ul className="mt-2 space-y-2">
                  {verdict.matched.map((m) => (
                    <li key={m.id} className="rounded-lg bg-white/80 p-3 text-sm">
                      {m.reason[lang]}{" "}
                      {m.source.startsWith("https://") && (
                        <a href={m.source} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline">
                          {t("sourceLink")}<ExternalIcon size={12} />
                        </a>
                      )}
                      <span className="ml-1 font-mono text-xs opacity-60">{m.id}{isCombo(m) ? "+" : ""}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className={`mt-5 rounded-lg p-4 ${verdict.tier === "likely_scam" ? "bg-red-700 text-white" : "border border-slate-200 bg-white text-slate-950"}`}>
              <p className="font-semibold">{verdict.tier === "likely_scam" ? t("handoffBanner") : t("paidAnyTier")}</p>
              {redacted && (
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5" checked={withEvidence} onChange={(e) => setWithEvidence(e.target.checked)} />
                  <span>{t("evidenceOptIn")}</span>
                </label>
              )}
              {withEvidence && (
                <div className="mt-2 rounded bg-white/95 p-2 text-sm text-slate-950">
                  <p className="text-xs text-slate-600">{t("evidencePreview")}</p>
                  <p className="whitespace-pre-wrap">{redacted}</p>
                </div>
              )}
              <button type="button" onClick={() => onHandoff(withEvidence ? redacted : "")}
                className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg font-bold ${verdict.tier === "likely_scam" ? "bg-white text-red-800" : "bg-red-700 text-white"}`}>
                <FileIcon size={18} />{t("handoffButton")}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
