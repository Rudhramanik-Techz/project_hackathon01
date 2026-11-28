import { useEffect } from "react";
import { SCAMS } from "../content";
import { type StringKey, useT } from "../i18n";
import { useKept, usePlace } from "../lib/session";
import type { Actions } from "../routes";
import { Contacts, NeverShare, Panel, Rules } from "../ui/bits";
import { ReadButton } from "../ui/ReadButton";

export function Guide({ open, onShown }: { open: string | null; onShown: () => void }) {
  const t = useT();
  const [search, setSearch] = usePlace("search", "", (v) => typeof v === "string");
  const q = search.trim().toLowerCase();
  // Opened from search or from a result: clear the filter, then open that entry and bring it into view.
  useEffect(() => {
    if (!open) return;
    if (search) return setSearch("");
    const frame = requestAnimationFrame(() => {
      const entry = document.getElementById(`scam-${open}`);
      if (entry instanceof HTMLDetailsElement) {
        entry.open = true;
        entry.scrollIntoView({ block: "center" });
      }
      onShown();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, search, setSearch, onShown]);
  const key = (j: number, part: "n" | "s" | "a") => `scam.${j}.${part}` as StringKey;
  const list = SCAMS.map((id, j) => ({ id, j })).filter(({ j }) => !q || (["n", "s", "a"] as const).some((p) => t(key(j, p)).toLowerCase().includes(q)));
  return (
    <>
      <h1>{t("sGuide")}</h1>
      <div className="layout">
        <div>
          <label className="searchbox">
            {t("search")}
            <input id="search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="panel">
            {list.map(({ id, j }) => (
              <details className="acc" id={`scam-${id}`} key={id}>
                <summary>{t(key(j, "n"))}</summary>
                <div className="two">
                  <div><h3>{t("sounds")}</h3><p>{t(key(j, "s"))}</p></div>
                  <div><h3>{t("doThis")}</h3><p>{t(key(j, "a"))}</p></div>
                </div>
              </details>
            ))}
            {list.length === 0 && <p className="pad">{t("none")}</p>}
          </div>
        </div>
        <aside><NeverShare /><Contacts /></aside>
      </div>
    </>
  );
}

const FAKE = [true, false, true, true, false, true]; // which of the six practice messages are scams

type QuizState = { i: number; score: number; pick: boolean | null };
const START: QuizState = { i: 0, score: 0, pick: null };
const validQuiz = (v: unknown) => {
  const q = v as QuizState;
  return !!q && Number.isInteger(q.i) && q.i >= 0 && q.i <= FAKE.length && Number.isInteger(q.score) && (q.pick === null || typeof q.pick === "boolean");
};

export function Quiz({ actions }: { actions: Actions }) {
  const t = useT();
  const [quiz, setQuiz] = usePlace("quiz", START, validQuiz);
  const { i, score, pick } = quiz;
  if (i >= FAKE.length)
    return (
      <>
        <h1>{t("sQuiz")}</h1>
        <Panel title={t("result", { a: score, b: FAKE.length })}>
          <div className="pad row">
            <button type="button" className="btn" onClick={() => setQuiz(START)}>{t("again")}</button>
            <button type="button" className="btn sec" onClick={() => actions.go("guide")}>{t("nGuide")}</button>
          </div>
        </Panel>
      </>
    );
  const fake = FAKE[i]!;
  const answer = (choice: boolean) => setQuiz({ i, pick: choice, score: score + (choice === fake ? 1 : 0) });
  return (
    <>
      <h1>{t("sQuiz")}</h1>
      <p className="lead">{t("qIntro")}</p>
      <div className="narrow">
        <Panel title={t("qNo", { a: i + 1, b: FAKE.length })}>
          <div className="pad">
            <blockquote id="src-quiz">{t(`quiz.${i}.m` as StringKey)}</blockquote>
            <div className="row"><ReadButton key={i} from={["src-quiz"]} /></div>
            <div className="row big">
              <button type="button" className="btn sec" data-answer="asli" disabled={pick !== null} onClick={() => answer(false)}>{t("asli")}</button>
              <button type="button" className="btn sec" data-answer="nakli" disabled={pick !== null} onClick={() => answer(true)}>{t("nakli")}</button>
            </div>
          </div>
          {pick !== null && (
            <>
              <div className={`verdict ${pick === fake ? "v-ok" : "v-likely_scam"}`} role="status">
                <b>{t(pick === fake ? "right" : "wrong")} {t(fake ? "nakli" : "asli")}</b>
                <span>{t(`quiz.${i}.w` as StringKey)}</span>
              </div>
              <div className="pad">
                <button type="button" className="btn" id="qnext" onClick={() => setQuiz({ i: i + 1, score, pick: null })}>{t("next")}</button>
              </div>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}

const FAMILY_FIELDS = [["code", "code"], ["name", "cname"], ["num", "cnum"]] as const;

/** The code word is held in memory for printing and is never stored or sent. */
export function Family() {
  const t = useT();
  const [card, setCard] = useKept("family", { code: "", name: "", num: "" });
  return (
    <>
      <h1>{t("sFamily")}</h1>
      <p className="lead">{t("fIntro")}</p>
      <div className="cols">
        <Panel title={t("nFamily")}>
          <div className="pad form">
            {FAMILY_FIELDS.map(([k, label]) => (
              <label key={k}>
                {t(label)}
                <input id={`fam-${k}`} maxLength={40} autoComplete="off" value={card[k]} onChange={(e) => setCard({ ...card, [k]: e.target.value })} />
              </label>
            ))}
            <button type="button" className="btn" onClick={() => window.print()}>{t("print")}</button>
          </div>
        </Panel>
        <div id="card">
          <div className="printable safety">
            <h3>{t("cardT")}</h3>
            <dl className="dl">
              {FAMILY_FIELDS.map(([k, label]) => (
                <div key={k}><dt>{t(label)}</dt><dd>{card[k] || "________"}</dd></div>
              ))}
              <div><dt>{t("hl")}</dt><dd><b>1930</b></dd></div>
            </dl>
            <p><b>{t("cardR")}</b></p>
            <p>{t("keepPriv")}</p>
          </div>
        </div>
      </div>
      <Panel title={t("saathiRulesTitle")}><Rules /></Panel>
    </>
  );
}
