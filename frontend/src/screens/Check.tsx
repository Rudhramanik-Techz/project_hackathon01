// Scam checker running on the phone (v3). The message is never sent anywhere. The optional AI wording gets
// only the verdict and rule IDs. "Already sent money?" is offered at every tier.
import { type Dispatch, useEffect, useMemo, useState } from "react";
import { postExplain } from "../api";
import type { Action, CaseState } from "../case/model";
import { SCAMS } from "../content";
import { type Lang, raw, type StringKey, useLang, useT } from "../i18n";
import { isCombo, MAX_SCALARS, redact, type Rule, type Combo, withinLimit } from "../lib/checker";
import { copyText } from "../lib/files";
import { cannotCheck } from "../lib/readable";
import { engine } from "../lib/rules";
import { useKept } from "../lib/session";
import { templateExplanation } from "../lib/templates";
import type { Actions } from "../routes";
import samples from "../samples/samples.json";
import { Ext, Panel } from "../ui/bits";
import { ReadButton, stopReading } from "../ui/ReadButton";
import { toast } from "../ui/toast";

const AI_LANGS = ["en", "hi", "ta"]; // the explain service supports these

/** The pasted message and what was last checked: held in memory only, kept while moving between pages. */
export function useCheckState() {
  const [text, setText] = useKept("checkText", "");
  const [checked, setChecked] = useKept<string | null>("checked", null);
  return {
    text,
    checked,
    run(message: string) {
      setText(message);
      setChecked(message);
    },
    edit(message: string) {
      setText(message);
      if (message !== checked) {
        setChecked(null);
        stopReading();
      }
    },
    clear() {
      setText("");
      setChecked(null);
    },
  };
}

type CheckState = ReturnType<typeof useCheckState>;

function reason(m: Rule | Combo, lang: Lang): string {
  return raw(lang, `r.${m.id}`) || (m.reason as Record<string, string>)[lang] || m.reason.en;
}

function Result({ message, c, dispatch, actions }: { message: string; c: CaseState; dispatch: Dispatch<Action>; actions: Actions }) {
  const t = useT();
  const lang = useLang();
  const verdict = useMemo(() => engine.check(message), [message]);
  const [ai, setAi] = useState({ loading: false, text: "", lang: "" });

  // Optional friendlier wording from Bedrock: only tier, family and rule IDs leave the phone.
  useEffect(() => {
    setAi({ loading: false, text: "", lang });
    if (verdict.tier === "no_known_pattern" || !navigator.onLine || !AI_LANGS.includes(lang)) return;
    let live = true;
    setAi({ loading: true, text: "", lang });
    void postExplain({ lang, tier: verdict.tier, family: verdict.family, ruleIds: verdict.matched.map((m) => m.id) }).then((r) => {
      if (live) setAi({ loading: false, text: r ?? "", lang });
    });
    return () => {
      live = false;
    };
  }, [verdict, lang]);

  const none = verdict.tier === "no_known_pattern";
  const cannot = none && cannotCheck(message);
  const scam = SCAMS.indexOf(verdict.family ?? "");
  const reasons = verdict.matched.map((m) => reason(m, lang));
  const template = none ? "" : templateExplanation(verdict.tier, verdict.family, reasons, lang);
  const redacted = redact(message.trim());
  const title: StringKey = cannot ? "cantRead" : verdict.tier === "likely_scam" ? "tierLikely" : verdict.tier === "suspicious" ? "tierSuspicious" : "tierNone";
  const added = c.origin === "personal" && !!redacted && c.info.evidence === redacted;
  const steps: StringKey[] = none && !cannot ? ["d3", "d1"] : ["d1", "d2", "d3", "d4"];

  return (
    <>
      <div className={`verdict v-${cannot ? "suspicious" : verdict.tier}`}>
        {verdict.tier === "likely_scam" && <span className="stamp" aria-hidden="true">{t("nakli")}</span>}
        <b id="src-verdict">{t(title)}</b>
        {cannot ? (
          <span>{t("cantReadSub")}</span>
        ) : none ? (
          <span>{t("tierNoneSub")}</span>
        ) : (
          <>
            <span>{t("score")}: {verdict.score}/100</span>
            <meter min={0} max={100} low={35} high={70} optimum={0} value={verdict.score} />
            {scam >= 0 && (
              <span>{t("type")}: <button type="button" className="link" onClick={() => actions.openScam(SCAMS[scam]!)}>{t(`scam.${scam}.n` as StringKey)}</button></span>
            )}
          </>
        )}
      </div>

      {(template || ai.loading || (ai.text && ai.lang === lang)) && (
        <div className="pad">
          {template && <p>{template}</p>}
          {ai.loading && <p className="muted">{t("aiWriting")}</p>}
          {ai.text && ai.lang === lang && (
            <div className="ai">
              <p>{ai.text}</p>
              <small>{t("aiLabel")}</small>
            </div>
          )}
        </div>
      )}

      {verdict.matched.length > 0 && (
        <div className="pad">
          <h3>{t("whyTitle")}</h3>
          <ul className="why" id="src-why">
            {verdict.matched.map((m, i) => (
              <li key={m.id}>
                <span id={`src-why-${i}`}>{reasons[i]}</span>
                <span className="ruleref">
                  {m.source.startsWith("https://") && <Ext href={m.source}>{t("sourceLink")}</Ext>}
                  <code>{m.id}{isCombo(m) ? "+" : ""}</code>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pad">
        <h3>{t("doNowH")}</h3>
        <ul className="why" id="src-do">
          {steps.map((k) => <li key={k}>{t(k)}</li>)}
        </ul>
        <div className="row">
          <ReadButton key={message} from={["src-verdict", ...reasons.map((_, i) => `src-why-${i}`), "src-do"]} />
          {!(none && !cannot) && (
            <>
              <button type="button" className="btn sec sm" onClick={async () => toast(t((await copyText(t("warnMsg"))) ? "copied" : "copyFailed"))}>{t("warnFam")}</button>
              <Ext href="https://sancharsaathi.gov.in">sancharsaathi.gov.in</Ext>
            </>
          )}
        </div>
      </div>

      {redacted && (
        <div className="pad">
          <h3>{t("evidencePreview")}</h3>
          <pre className="doc">{redacted}</pre>
          <button type="button" className="btn sec sm" id="addevidence"
            onClick={() => {
              if (c.origin === "synthetic") dispatch({ type: "reset", origin: "personal" }); // never mix demo into a real case
              dispatch({ type: "info", key: "evidence", value: redacted });
            }}>
            {t("addBtn")}
          </button>{" "}
          {added && <span role="status">✓ {t("added")}</span>}
        </div>
      )}

      <div className="pad handoff">
        <strong>{t(verdict.tier === "likely_scam" ? "handoffBanner" : "paidAnyTier")}</strong>
        <button type="button" className="btn red sm" onClick={actions.openPaid}>{t("handoffButton")}</button>
      </div>
    </>
  );
}

export function Check({ state, c, dispatch, actions }: { state: CheckState; c: CaseState; dispatch: Dispatch<Action>; actions: Actions }) {
  const t = useT();
  const [tooLong, setTooLong] = useState(false);
  const examples: [keyof typeof samples.check, StringKey][] = [["digitalArrest", "scam.0.n" as StringKey], ["courier", "scam.1.n" as StringKey], ["genuine", "exGen"]];
  const { text, checked } = state;
  const problem: StringKey | null = tooLong ? "checkTooLong" : checked === null ? null : !checked.trim() ? "checkEmpty" : !withinLimit(checked) ? "checkTooLong" : null;
  return (
    <>
      <h1>{t("checkTitle")}</h1>
      <p className="lead">{t("checkRules")}</p>
      <div className="cols">
        <Panel title={<label htmlFor="msg">{t("checkPlaceholder")}</label>}>
          <div className="pad">
            <textarea id="msg" value={text}
              onChange={(e) => {
                const v = e.target.value;
                if (v.length > 2 * MAX_SCALARS) return setTooLong(true); // keep the previous text
                setTooLong(false);
                state.edit(v);
              }} />
            <p>{[...text].length}/{MAX_SCALARS}. {t("checkLocalNote")}</p>
            <div className="row">
              <button type="button" className="btn" id="run" onClick={() => (setTooLong(false), state.run(text))}>{t("checkButton")}</button>
              <button type="button" className="btn sec" onClick={() => (setTooLong(false), state.clear())}>{t("clear")}</button>
            </div>
            <h3>{t("examples")}</h3>
            <div className="row">
              {examples.map(([key, label]) => (
                <button key={key} type="button" className="btn sec sm" data-example={key} onClick={() => (setTooLong(false), state.run(samples.check[key]))}>{t(label)}</button>
              ))}
            </div>
          </div>
        </Panel>
        <section className="panel" id="result" aria-live="polite">
          {problem ? (
            <p className="pad err" role="alert">{t(problem)}</p>
          ) : checked === null ? (
            <div className="pad">{t("checkResultEmpty")}</div>
          ) : (
            <Result message={checked} c={c} dispatch={dispatch} actions={actions} />
          )}
        </section>
      </div>
    </>
  );
}
