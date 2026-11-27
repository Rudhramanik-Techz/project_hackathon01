// Scam checker running on the phone (v3). The message is never sent anywhere. The optional AI wording gets
// only the verdict and rule IDs. "Already sent money?" is offered at every tier.
import { type Dispatch, useEffect, useMemo, useRef, useState } from "react";
import { postExplain } from "../api";
import { type Action, type CaseState, LIMITS } from "../case/model";
import { SCAMS } from "../content";
import { type Lang, raw, type StringKey, useLang, useT } from "../i18n";
import { isCombo, MAX_SCALARS, redact, type Rule, type Combo, withinLimit } from "../lib/checker";
import { copyText } from "../lib/files";
import { cannotCheck } from "../lib/readable";
import { engine } from "../lib/rules";
import { useKept } from "../lib/session";
import { type Recognizer, recognitionErrorKey, recognizerCtor, speakLocal, speechTag, whenVoicesReady } from "../lib/voice";
import { templateExplanation } from "../lib/templates";
import type { Actions } from "../routes";
import samples from "../samples/samples.json";
import { Ext, Panel } from "../ui/bits";
import { ReadButton, stopReading } from "../ui/ReadButton";
import { toast } from "../ui/toast";

const AI_LANGS = ["en", "hi", "ta"]; // the explain service supports these
// The spec has no runtime AI model (§1.3). The optional Bedrock wording is only called when a build sets
// VITE_EXPLAIN=on (after the AWS account is approved); otherwise the reviewed template text is shown.
const AI_ON = import.meta.env.VITE_EXPLAIN === "on";

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

function Result({ message, c, dispatch, actions, spoken = 0 }: { message: string; c: CaseState; dispatch: Dispatch<Action>; actions: Actions; spoken?: number }) {
  const t = useT();
  const lang = useLang();
  const verdict = useMemo(() => engine.check(message), [message]);
  const [ai, setAi] = useState({ loading: false, text: "", lang: "" });

  // Optional friendlier wording from Bedrock: only tier, family and rule IDs leave the phone.
  useEffect(() => {
    setAi({ loading: false, text: "", lang });
    if (!AI_ON || verdict.tier === "no_known_pattern" || !navigator.onLine || !AI_LANGS.includes(lang)) return;
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
  const steps: StringKey[] = none && !cannot ? ["d3", "d1"] : ["d1", "d2", "d3", "d4"];

  // A voice check is answered by voice too: the verdict and the first reason, once, in the chosen language.
  // With no on-device voice for that language nothing is spoken; the text stays on screen.
  const say = `${t(title)}. ${reasons[0] ?? t(cannot ? "cantReadSub" : "tierNoneSub")}`;
  const [canSay, setCanSay] = useState(false);
  const saidFor = useRef(0); // each voice check is spoken once, even if React runs the effect twice
  useEffect(() => {
    if (!spoken || saidFor.current === spoken) return;
    return whenVoicesReady(() => {
      if (saidFor.current === spoken) return;
      saidFor.current = spoken;
      setCanSay(speakLocal(say, lang));
    });
  }, [spoken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopReading(), []);

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
        {spoken > 0 && canSay && (
          <button type="button" className="btn sec sm" id="replay" onClick={() => speakLocal(say, lang)}>
            <span aria-hidden="true">🔊 </span>{t("boloReplay")}
          </button>
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

      {redacted && <Excerpts key={redacted} redacted={redacted} c={c} dispatch={dispatch} />}

      <div className="pad handoff">
        <strong>{t(verdict.tier === "likely_scam" ? "handoffBanner" : "paidAnyTier")}</strong>
        <button type="button" className="btn red sm" onClick={actions.openPaid}>{t("handoffButton")}</button>
      </div>
    </>
  );
}

/** "Bolo": speak the message instead of typing it. Hidden when the browser has no speech recognition. */
function Bolo({ onText }: { onText: (text: string) => void }) {
  const t = useT();
  const lang = useLang();
  const Ctor = useMemo(recognizerCtor, []);
  const [listening, setListening] = useState(false);
  const [msg, setMsg] = useState<StringKey | null>(null);
  const rec = useRef<Recognizer | null>(null);
  useEffect(() => () => rec.current?.abort(), [lang]); // a language change or leaving the page stops listening
  if (!Ctor) return null;

  const toggle = () => {
    if (rec.current) return rec.current.abort();
    stopReading();
    window.speechSynthesis?.getVoices(); // Chrome loads its voice list on first request; warm it for the answer
    setMsg(null);
    const r = new Ctor();
    r.lang = speechTag(lang);
    r.continuous = false; // the browser stops by itself when the person pauses
    r.interimResults = false;
    r.maxAlternatives = 1;
    let heard = "";
    r.onresult = (e) => {
      heard = Array.from(e.results, (res) => res[0]?.transcript ?? "").join(" ").trim();
    };
    r.onerror = (e) => {
      const key = recognitionErrorKey(e.error);
      if (key) setMsg(key);
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      if (heard) onText(heard);
    };
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      rec.current = null;
      setListening(false);
      setMsg("boloError");
    }
  };

  return (
    <div className="bolo">
      <button type="button" className={`btn ${listening ? "red" : "sec"}`} id="bolo" aria-pressed={listening} onClick={toggle}>
        <span aria-hidden="true">🎤 </span>{t(listening ? "boloListening" : "boloButton")}
      </button>
      {msg && <p role="alert" className="err">{t(msg)}</p>}
      <small className="muted">{t("boloNote")}</small>
    </div>
  );
}

const SENTENCE = /(?<=[.!?।])\s+|\n+/u;

/** Nothing from the message reaches the report until the person ticks the parts to add (spec R3-A20). */
function Excerpts({ redacted, c, dispatch }: { redacted: string; c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const parts = useMemo(() => redacted.split(SENTENCE).map((s) => s.trim()).filter(Boolean), [redacted]);
  const [picked, setPicked] = useState<number[]>([]);
  const text = parts.filter((_, i) => picked.includes(i)).join(" ");
  const added = c.origin === "personal" && !!text && c.excerpts.includes(text);
  const full = c.origin === "personal" && c.excerpts.length >= LIMITS.excerpts;
  return (
    <div className="pad">
      <h3>{t("excerptPick")}</h3>
      <div id="excerpt-parts">
        {parts.map((p, i) => (
          <label className="tick" key={i}>
            <input type="checkbox" checked={picked.includes(i)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, i].sort((a, b) => a - b) : picked.filter((x) => x !== i))} />
            <span>{p}</span>
          </label>
        ))}
      </div>
      {text && (
        <>
          <h3>{t("evidencePreview")}</h3>
          <pre className="doc">{text}</pre>
        </>
      )}
      <button type="button" className="btn sec sm" id="addevidence" disabled={!text || added || full}
        onClick={() => {
          if (c.origin === "synthetic") dispatch({ type: "reset", origin: "personal" }); // never mix demo into a real case
          dispatch({ type: "addExcerpt", text });
        }}>
        {t("addBtn")}
      </button>{" "}
      {added && <span role="status">✓ {t("added")}</span>}
      {full && !added && <span role="status" className="warnline">{t("excerptFull")}</span>}
    </div>
  );
}

export function Check({ state, c, dispatch, actions }: { state: CheckState; c: CaseState; dispatch: Dispatch<Action>; actions: Actions }) {
  const t = useT();
  const [tooLong, setTooLong] = useState(false);
  // Which check came from voice: its result is read aloud once, with a button to hear it again.
  const [voiceText, setVoiceText] = useState<string | null>(null);
  const [voiceRun, setVoiceRun] = useState(0);
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
            <Bolo
              onText={(spoken) => {
                if (spoken.length > 2 * MAX_SCALARS) return setTooLong(true);
                setTooLong(false);
                setVoiceText(spoken);
                setVoiceRun((n) => n + 1);
                state.run(spoken);
              }}
            />
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
            <Result message={checked} c={c} dispatch={dispatch} actions={actions} spoken={voiceText !== null && voiceText === checked ? voiceRun : 0} />
          )}
        </section>
      </div>
    </>
  );
}
