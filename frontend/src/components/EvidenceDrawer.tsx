import { useState } from "react";
import type { ImageRec, Origin } from "../case/model";
import { ChevronRightIcon, CloudIcon } from "./Icons";
import { isStringKey, useT } from "../i18n";

/** "How this was read": provenance and the current run's real timings. No lookup of past requests (v3). */
export function EvidenceDrawer({ image, origin }: { image: ImageRec; origin: Origin }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const m = image.meta;
  const label = (prefix: string, v: string) => {
    const k = `${prefix}${v}`;
    return isStringKey(k) ? t(k) : v;
  };
  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 text-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between px-3 text-left font-semibold text-slate-700">
        <span className="flex items-center gap-2"><CloudIcon size={16} />{open ? t("traceHide") : t("traceShow")}</span>
        <ChevronRightIcon size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-200 px-3 pb-3 pt-2">
          <p className="flex flex-wrap gap-2">
            <span className="rounded bg-white px-2 py-0.5">{origin === "synthetic" ? t("provSynthetic") : t("provPersonal")}</span>
            {image.extraction && <span className="rounded bg-white px-2 py-0.5">{label("ext_", image.extraction)}</span>}
          </p>
          {image.extraction === "live" && m ? (
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              <dt>{t("traceAdmission")}</dt>
              <dd className="text-right tabular-nums">{m.timingsMs.admission} ms</dd>
              <dt>{t("traceProvider")}</dt>
              <dd className="text-right tabular-nums">{m.timingsMs.provider} ms</dd>
              <dt>{t("traceTotal")}</dt>
              <dd className="text-right tabular-nums">{m.timingsMs.total} ms</dd>
              <dt>{t("traceRegion")}</dt>
              <dd className="text-right">{m.region}</dd>
              {m.usedToday != null && (
                <>
                  <dt>{t("traceUsed")}</dt>
                  <dd className="text-right tabular-nums">{m.usedToday} / {m.dailyCap}</dd>
                </>
              )}
              <dt>{t("traceBuild")}</dt>
              <dd className="text-right">{m.build}</dd>
              <dt>{t("traceRequest")}</dt>
              <dd className="truncate text-right font-mono text-xs">{m.requestId.slice(0, 8)}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-slate-600">{t("traceNoTimings")}</p>
          )}
          {m && m.warnings.length > 0 && (
            <p className="mt-2">
              {t("traceWarnings")}: {m.warnings.map((w) => label("warn_", w)).join(" · ")}
            </p>
          )}
          <a href="/eval-report.md" target="_blank" rel="noopener" className="mt-2 inline-block underline">
            {t("traceEval")}
          </a>
        </div>
      )}
    </div>
  );
}
