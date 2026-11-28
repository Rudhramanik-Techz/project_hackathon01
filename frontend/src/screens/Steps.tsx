// "What happened?": six situations, three things to do now for each. Fixed wording, nothing is sent.
import type { StringKey } from "../i18n";
import { useT } from "../i18n";
import { usePlace } from "../lib/session";
import type { Actions } from "../routes";
import { Panel } from "../ui/bits";
import { ReadButton } from "../ui/ReadButton";

const SITUATIONS = [1, 2, 3, 4, 5, 6];

export function Steps({ actions }: { actions: Actions }) {
  const t = useT();
  const [choice, setChoice] = usePlace("triage", 0, (v) => typeof v === "number" && [0, ...SITUATIONS].includes(v));
  const key = (k: string) => k as StringKey;
  return (
    <>
      <h1>{t("triT")}</h1>
      <p className="lead">{t("triI")}</p>
      <div className="choices" role="group" aria-label={t("triT")}>
        {SITUATIONS.map((n) => (
          <button key={n} type="button" id={`tri-${n}`} aria-pressed={choice === n} onClick={() => setChoice(n)}>{t(key(`tri${n}`))}</button>
        ))}
      </div>
      <div aria-live="polite">
        {choice > 0 && (
          <Panel title={t(key(`tri${choice}`))}>
            <ol className="plan" id="src-plan">
              {[1, 2, 3].map((m) => (
                <li key={m}>{t(key(`t${choice}${m}`))}</li>
              ))}
            </ol>
            <div className="pad row">
              <ReadButton from={["src-plan"]} />
              <a className="btn red" href="tel:1930">{t("call1930")}</a>
              {choice === 1 && <button type="button" className="btn" onClick={actions.openPaid}>{t("nPaid")}</button>}
            </div>
          </Panel>
        )}
      </div>
      <div className="warnbox">{t("triWarn")}</div>
    </>
  );
}
