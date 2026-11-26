// Looks only at the text of a web address, on this device. The link is never opened or sent.
import type { StringKey } from "../i18n";
import { useT } from "../i18n";
import { inspectLink } from "../lib/link";
import { useKept } from "../lib/session";
import { Panel } from "../ui/bits";

export function LinkCheck() {
  const t = useT();
  const [link, setLink] = useKept("link", "");
  const [run, setRun] = useKept("linkRun", false);
  const report = run ? inspectLink(link) : null;
  return (
    <>
      <h1>{t("sLink")}</h1>
      <p className="lead">{t("linkI")}</p>
      <div className="narrow">
        <Panel title={<label htmlFor="link">{t("linkL")}</label>}>
          <div className="pad">
            <input id="link" className="wide" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} value={link}
              onChange={(e) => (setLink(e.target.value), setRun(false))} onKeyDown={(e) => e.key === "Enter" && setRun(true)} />
            <div className="row">
              <button type="button" className="btn" onClick={() => setRun(true)}>{t("checkButton")}</button>
              <button type="button" className="btn sec" onClick={() => (setLink(""), setRun(false))}>{t("clear")}</button>
            </div>
          </div>
          <div id="linkout" aria-live="polite">
            {run && !report && <p className="pad err">{t("lkBad")}</p>}
            {report && (
              <>
                <div className={`verdict ${report.flags.length ? "v-suspicious" : "v-no_known_pattern"}`}>
                  <span>{t("linkHost")}</span>
                  <b className="host" lang="en" dir="ltr">{report.host}</b>
                </div>
                <div className="pad">
                  {report.flags.length ? (
                    <>
                      <h3>{t("lkWarn")}</h3>
                      <ul className="why">
                        {report.flags.map((f) => <li key={f}>{t(f as StringKey)}</li>)}
                      </ul>
                    </>
                  ) : (
                    <p>{t("lkNone")}</p>
                  )}
                  {report.gov && <p>{t("lkGov")}</p>}
                  <p><b>{t("d3")}</b></p>
                </div>
              </>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
