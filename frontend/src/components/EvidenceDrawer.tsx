import { useState } from "react";
import type { ImageRec, Origin } from "../case/model";
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
    <div className="trace">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{open ? t("traceHide") : t("traceShow")}</span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="pad">
          <p className="chips">
            <span>{origin === "synthetic" ? t("provSynthetic") : t("provPersonal")}</span>
            {image.extraction && <span>{label("ext_", image.extraction)}</span>}
          </p>
          {image.extraction === "live" && m ? (
            <dl className="timings">
              <dt>{t("traceAdmission")}</dt>
              <dd>{m.timingsMs.admission} ms</dd>
              <dt>{t("traceProvider")}</dt>
              <dd>{m.timingsMs.provider} ms</dd>
              <dt>{t("traceTotal")}</dt>
              <dd>{m.timingsMs.total} ms</dd>
              <dt>{t("traceRegion")}</dt>
              <dd>{m.region}</dd>
              {m.usedToday != null && (
                <>
                  <dt>{t("traceUsed")}</dt>
                  <dd>{m.usedToday} / {m.dailyCap}</dd>
                </>
              )}
              <dt>{t("traceBuild")}</dt>
              <dd>{m.build}</dd>
              <dt>{t("traceRequest")}</dt>
              <dd><code>{m.requestId.slice(0, 8)}</code></dd>
            </dl>
          ) : (
            <p>{t("traceNoTimings")}</p>
          )}
          {m && m.warnings.length > 0 && (
            <p>
              {t("traceWarnings")}: {m.warnings.map((w) => label("warn_", w)).join(" · ")}
            </p>
          )}
          <a href="/eval-report.md" target="_blank" rel="noopener">
            {t("traceEval")}
          </a>
        </div>
      )}
    </div>
  );
}
