// Golden Hour (v3): call first, type or read screenshots, confirm every field against its source, then one
// revision-bound pack. OCR only ever proposes; nothing reaches the pack until the person confirms it.
import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { postOcr, postTranslate } from "../api";
import {
  type Action,
  asciiDigits,
  type AttestKey,
  type CaseState,
  FIELD_ORDER,
  type FieldName,
  facts,
  hasDraft,
  type ImageRec,
  LIMITS,
  type Transaction,
  toInput,
  unresolvedCount,
} from "../case/model";
import { CopyButton } from "../components/CopyButton";
import { Crop } from "../components/Crop";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { PackSheet, PrintPortal, usePrintPack } from "../components/PackSheet";
import { dateLocale, isStringKey, type Lang, type StringKey, type Translate, useLang, useT } from "../i18n";
import { saveFile } from "../lib/files";
import { formatIst, formatPaise, minutesSince, spaceDigits, splitList } from "../lib/format";
import { reminderIcs } from "../lib/ics";
import { ImageError, prepareImage } from "../lib/image";
import { useKept, usePlace } from "../lib/session";
import { buildBankEmail } from "../pack/email";
import { buildNcrpCards } from "../pack/ncrp";
import { buildSheet, sheetTitle } from "../pack/sheet";
import { build1930Script } from "../pack/script";
import type { Actions } from "../routes";
import { Ext, Panel } from "../ui/bits";
import { ReadButton } from "../ui/ReadButton";
import { toast } from "../ui/toast";

const PACE_MS = 1100; // gap between distinct images after a response, so one tab never hits the 1/s bucket
const ENUMS: Partial<Record<FieldName, string[]>> = {
  direction: ["outgoing", "incoming"],
  paymentStatus: ["completed", "pending", "failed", "reversed"],
};
const ENUM_PREFIX: Partial<Record<FieldName, string>> = { direction: "dir_", paymentStatus: "st_" };
const SECTIONS: [string, StringKey][] = [["secU", "uploadTitle"], ["secA", "secA"], ["secB", "secB"], ["secC", "secC"], ["secD", "secD"], ["secE", "secE"]];
const OPEN_STATES = ["proposed", "editing", "empty"];

function useNow(fixed: string | null): number {
  const [now, setNow] = useState(() => (fixed ? Date.parse(fixed) : Date.now()));
  useEffect(() => {
    if (fixed) return setNow(Date.parse(fixed));
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [fixed]);
  return now;
}

function display(field: FieldName, value: string, t: Translate, lang: Lang): string {
  if (field === "amountPaise") return formatPaise(BigInt(value));
  if (field === "upiRef") return spaceDigits(value);
  if (field === "occurredAt") {
    const { date, time } = formatIst(value, dateLocale(lang), lang === "en");
    return `${date}, ${time}`;
  }
  const key = `${ENUM_PREFIX[field] ?? ""}${value}`;
  return ENUM_PREFIX[field] && isStringKey(key) ? t(key) : value;
}

// ------------------------------------------------------------------------------------------------ screen

export function Paid({ c, dispatch, lost, actions }: { c: CaseState; dispatch: Dispatch<Action>; lost: boolean; actions: Actions }) {
  const t = useT();
  const controllers = useRef(new Map<string, AbortController>());
  const latch = useRef(new Set<string>());
  const lastResponse = useRef(0);
  const now = useNow(c.scenarioClock);
  // One payment is shown at a time. The choice follows the payment, not its position.
  const [picked, setPicked] = useKept<string | null>(`tx:${c.id}`, null);
  const tx = c.txs.find((x) => x.id === picked) ?? c.txs[0];
  const jumpTo = useRef<string | null>(null);
  const lastJump = useRef<{ txId: string; f: string } | null>(null);
  const addedTx = useRef(false);
  const sentImage = useRef<string | null>(null);

  // After "next unchecked detail" switches payment, bring that row into view.
  useEffect(() => {
    if (!jumpTo.current) return;
    const row = document.getElementById(`row-${jumpTo.current}`);
    jumpTo.current = null;
    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
  });
  // A newly added payment, or the one a screenshot was just read into, becomes the shown one.
  useEffect(() => {
    if (addedTx.current) {
      addedTx.current = false;
      setPicked(c.txs[c.txs.length - 1]?.id ?? null);
      return;
    }
    const img = c.images.find((i) => i.id === sentImage.current);
    if (!img || img.state === "sending") return;
    sentImage.current = null;
    if (img.state === "reviewable") setPicked(c.txs.find((x) => x.imageIds.includes(img.id))?.id ?? null);
  }, [c.txs, c.images, setPicked]);

  // Every unchecked detail, payment by payment, in field order. "Next"/"Previous" step through it from the
  // detail that has focus, wrapping around.
  const stepUnchecked = (dir: 1 | -1) => {
    const list = c.txs.flatMap((x) => FIELD_ORDER.filter((f) => OPEN_STATES.includes(x.fields[f].state)).map((f) => ({ x, f })));
    if (!list.length) return;
    // Where we are: the detail that has focus, or else the one the last jump went to (clicking this button
    // moves focus onto the button itself).
    const focused = document.activeElement?.closest<HTMLElement>(".field")?.id.replace(/^row-/, "");
    const from = focused && tx ? { txId: tx.id, f: focused } : lastJump.current;
    const at = from ? list.findIndex(({ x, f }) => x.id === from.txId && f === from.f) : -1;
    // With nothing focused, start inside the payment being shown.
    const first = list.findIndex(({ x }) => x.id === tx?.id);
    const here = at >= 0 ? at : dir === 1 ? (first >= 0 ? first - 1 : -1) : first >= 0 ? first + 1 : list.length;
    const { x: target, f: field } = list[(here + dir + list.length) % list.length]!;
    lastJump.current = { txId: target.id, f: field };
    jumpTo.current = field;
    setPicked(target.id);
    if (target.id === tx?.id) {
      const row = document.getElementById(`row-${field}`);
      row?.scrollIntoView({ block: "center" });
      row?.focus({ preventScroll: true });
      jumpTo.current = null;
    }
  };

  // Leaving the screen or hiding the tab revokes ownership of pending reads; nothing restarts by itself.
  useEffect(() => {
    const revoke = () => {
      if (!controllers.current.size) return;
      controllers.current.forEach((ctrl) => ctrl.abort());
      controllers.current.clear();
      latch.current.clear();
      dispatch({ type: "revokePending" });
    };
    const onVis = () => document.visibilityState === "hidden" && revoke();
    window.addEventListener("pagehide", revoke);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", revoke);
      document.removeEventListener("visibilitychange", onVis);
      revoke();
    };
  }, [dispatch]);

  const read = async (img: ImageRec) => {
    if (latch.current.has(img.id) || !img.consent) return; // one tap = one attempt, even if tapped five times
    latch.current.add(img.id);
    const generation = c.generation;
    const key = crypto.randomUUID();
    const ctrl = new AbortController();
    controllers.current.set(img.id, ctrl);
    sentImage.current = img.id;
    dispatch({ type: "sending", generation, imageId: img.id, attemptId: key });
    try {
      const wait = lastResponse.current + PACE_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (ctrl.signal.aborted) return;
      const res = await postOcr(img.blob, key, img.id, ctrl.signal);
      lastResponse.current = Date.now();
      if (res.ok) dispatch({ type: "ocrResult", generation, imageId: img.id, attemptId: key, candidates: res.candidates, meta: res.meta, extraction: "live" });
      else dispatch({ type: "ocrFailed", generation, imageId: img.id, attemptId: key, code: res.code });
    } finally {
      controllers.current.delete(img.id);
      latch.current.delete(img.id);
    }
  };

  const total = FIELD_ORDER.length * c.txs.length;
  const confirmed = c.txs.reduce((n, x) => n + FIELD_ORDER.filter((f) => x.fields[f].state === "confirmed").length, 0);
  const pending = unresolvedCount(c);
  const elapsed = facts(c).txs.flatMap((x, i) => {
    const m = x.occurredAt && x.direction === "outgoing" ? minutesSince(x.occurredAt, now) : null;
    return m === null ? [] : [{ id: x.id, i: i + 1, m }];
  });
  const replaceAllowed = () => !(hasDraft(c) || c.origin === "synthetic") || window.confirm(t("clearConfirm"));

  return (
    <>
      <h1>{t("alreadyPaid")}</h1>
      <div className="callbar">
        <div>
          <strong>{t("callFirst")}</strong>
          {c.origin === "synthetic" && (<><br /><small>{t("syntheticBanner")}</small></>)}
        </div>
        <a className="btn red" href="tel:1930">{t("call1930")}</a>
      </div>
      {lost && <div className="notice" role="status">{t("lost")}</div>}
      {elapsed.length > 0 && (
        <div className="notice">
          {elapsed.map((e) => (<p key={e.id}><b>{t("elapsed", { i: e.i, m: e.m })}</b></p>))}
          <span>{t("elapsedHint")}</span>
        </div>
      )}
      <div className="layout rev">
        <aside className="side">
          <div className="panel pad" id="progress">
            <b>{t("progress", { a: confirmed, b: total })}</b>
            <progress max={total || 1} value={confirmed} />
            {pending > 0 && <p className="warnline">{t("unresolved", { n: pending })}</p>}
            <div className="row">
              <button type="button" className="btn sec sm" id="prevu" disabled={!c.txs.length} onClick={() => stepUnchecked(-1)}>{t("prevU")}</button>
              <button type="button" className="btn sec sm" id="nextu" disabled={!c.txs.length} onClick={() => stepUnchecked(1)}>{t("nextU")}</button>
            </div>
          </div>
          <ol className="panel toc">
            {SECTIONS.map(([id, label]) => (
              <li key={id}><button type="button" className="link" onClick={() => document.getElementById(id)?.scrollIntoView()}>{t(label)}</button></li>
            ))}
          </ol>
          <div className="row">
            <button type="button" className="btn sec sm" id="reset" onClick={() => replaceAllowed() && dispatch({ type: "reset", origin: "personal" })}>{t("clearCase")}</button>
            <button type="button" className="btn sec sm" id="loadexample" onClick={() => actions.openSeed("A")}>{t("loadEx")}</button>
          </div>
        </aside>
        <div>
          <Uploads c={c} dispatch={dispatch} onRead={read} />
          <Panel title={t("secA")} id="secA">
            <div className="paytabs">
              {c.txs.map((x, i) => (
                <button key={x.id} type="button" className={`btn sm ${x.id === tx?.id ? "" : "sec"}`} id={`pay-${i}`} aria-pressed={x.id === tx?.id} onClick={() => setPicked(x.id)}>
                  {t("txN", { n: i + 1 })}
                </button>
              ))}
              <button type="button" className="btn sec sm" id="addtx" disabled={c.txs.length >= LIMITS.txs}
                onClick={() => ((addedTx.current = true), dispatch({ type: "addTx" }))}>
                + {t("addTx")}
              </button>
              {tx && (
                <button type="button" className="btn sec sm" id="removetx"
                  onClick={() => {
                    if (FIELD_ORDER.some((f) => tx.fields[f].state !== "empty") && !window.confirm(`${t("removeTx")}?`)) return;
                    dispatch({ type: "removeTx", txId: tx.id });
                  }}>
                  {t("removeTx")}
                </button>
              )}
            </div>
            {tx && <LinkShots tx={tx} c={c} dispatch={dispatch} />}
            {tx ? FIELD_ORDER.map((f) => <FieldRow key={`${tx.id}-${f}`} tx={tx} field={f} c={c} dispatch={dispatch} />) : <p className="pad">{t("noPayments")}</p>}
          </Panel>
          <CaseInfo c={c} dispatch={dispatch} />
          <Outputs c={c} />
          <Attest c={c} dispatch={dispatch} />
          <Reminder />
          <Evidence key={c.id} caseId={c.id} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- payments

/** A screenshot read for one payment can also supply readings for another (e.g. two payments on one screen). */
function LinkShots({ tx, c, dispatch }: { tx: Transaction; c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const unlinked = c.images.filter((i) => i.candidates.length > 0 && !tx.imageIds.includes(i.id));
  if (!unlinked.length) return null;
  return (
    <div className="pad other" id="linkshots">
      {t("linkShot")}:{" "}
      {unlinked.map((i) => (
        <button key={i.id} type="button" className="btn sec sm" onClick={() => dispatch({ type: "linkImage", txId: tx.id, imageId: i.id })}>
          {i.name}
        </button>
      ))}
    </div>
  );
}

function FieldRow({ tx, field, c, dispatch }: { tx: Transaction; field: FieldName; c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const lang = useLang();
  const f = tx.fields[field];
  const [zoom, setZoom] = useState(false);
  const label = t(`f_${field}` as StringKey);
  const options = ENUMS[field];
  const source = "source" in f ? f.source : null;
  const img = source ? c.images.find((i) => i.id === source.imageId) : null;
  // Where each reading is used now (payment number), so moving one is an explicit, visible choice.
  const usedIn = new Map<string, number>();
  c.txs.forEach((x, n) =>
    FIELD_ORDER.forEach((k) => {
      const v = x.fields[k];
      if ("source" in v && v.source) usedIn.set(`${v.source.imageId}/${v.source.candidateId}`, n + 1);
    }),
  );
  const mine = source ? `${source.imageId}/${source.candidateId}` : "";
  const others = c.images
    .filter((i) => tx.imageIds.includes(i.id))
    .flatMap((i) => i.candidates.filter((k) => k.field === field && `${i.id}/${k.id}` !== mine).map((k) => ({ img: i, k, n: usedIn.get(`${i.id}/${k.id}`) })));
  const choose = (value: string) => {
    dispatch({ type: "edit", txId: tx.id, field, text: value });
    dispatch({ type: "confirmEdit", txId: tx.id, field });
  };
  const status: StringKey | null =
    f.state === "proposed" ? "fs_proposed" : f.state === "confirmed" ? (`fs_${f.method}` as StringKey) : f.state === "unknown" ? "fs_unknown" : f.state === "editing" ? "fs_editing" : null;

  return (
    <div className="field" id={`row-${field}`} tabIndex={-1} data-state={f.state}>
      <h3>
        {label}
        {status && (<><br /><span className={`tag ${f.state === "confirmed" ? "c" : f.state === "proposed" ? "p" : "e"}`}>{f.state === "confirmed" ? "✓ " : ""}{t(status)}</span></>)}
      </h3>
      <div>
        {(f.state === "proposed" || f.state === "confirmed") && <div className="val">{display(field, f.value, t, lang)}</div>}

        {f.state === "editing" &&
          (options ? (
            <div className="row">
              {options.map((o) => (
                <button key={o} type="button" className="btn sec sm" data-option={o} onClick={() => choose(o)}>{t(`${ENUM_PREFIX[field]}${o}` as StringKey)}</button>
              ))}
            </div>
          ) : (
            <input
              id={`in-${field}`}
              aria-label={label}
              type={field === "occurredAt" ? "datetime-local" : "text"}
              inputMode={field === "amountPaise" ? "decimal" : field === "upiRef" ? "numeric" : undefined}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={f.text}
              onChange={(e) => dispatch({ type: "edit", txId: tx.id, field, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && dispatch({ type: "confirmEdit", txId: tx.id, field })}
              aria-invalid={!!f.error}
              aria-describedby={f.error ? `${tx.id}-${field}-err` : undefined}
              autoFocus
            />
          ))}
        {f.state === "editing" && f.error && (
          <p id={`${tx.id}-${field}-err`} role="alert" className="err">{isStringKey(f.error) ? t(f.error) : f.error}</p>
        )}

        {source && img && f.state !== "editing" && (
          <>
            <Crop url={img.url} width={img.width} height={img.height} box={source.box} label={`${label}: ${source.raw}`} big={zoom} />
            <button type="button" className="link" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{t(zoom ? "zoomOut" : "zoomIn")}</button>
            <p className="srcline">
              “{source.raw}”{source.label ? ` · ${source.label}` : ""}
              {source.confidenceBp < 9000 ? ` · ⚠ ${t("hardToRead")}` : ""}
            </p>
          </>
        )}

        {others.length > 0 && f.state !== "editing" && (
          <div className="other">
            {t("otherReadings")}:{" "}
            {others.map(({ img: i, k, n }) => (
              <button key={`${i.id}/${k.id}`} type="button" className="btn sec sm"
                onClick={() => (n === undefined || window.confirm(t("moveReading", { n }))) && dispatch({ type: "propose", txId: tx.id, field, candidate: k, imageId: i.id })}>
                {display(field, k.value, t, lang)}
                {k.label ? ` (${k.label})` : ""}
                {n !== undefined ? ` · ${t("usedInTx", { n })}` : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="row end">
        {f.state === "proposed" && <button type="button" className="btn sm" data-ok={field} onClick={() => dispatch({ type: "accept", txId: tx.id, field })}>{t("accept")}</button>}
        {f.state === "editing" && !options && <button type="button" className="btn sm" data-save={field} onClick={() => dispatch({ type: "confirmEdit", txId: tx.id, field })}>{t("confirm")}</button>}
        {f.state === "editing" && <button type="button" className="btn sec sm" onClick={() => dispatch({ type: "cancelEdit", txId: tx.id, field })}>{t("cancel")}</button>}
        {f.state !== "editing" && (
          <button type="button" className="btn sec sm" data-start={field}
            onClick={() => dispatch({ type: "edit", txId: tx.id, field, text: f.state === "proposed" || f.state === "confirmed" ? toInput(field, f.value) : "" })}>
            {t(f.state === "empty" || f.state === "unknown" ? "typeIt" : "edit")}
          </button>
        )}
        {(f.state === "empty" || f.state === "proposed") && (
          <button type="button" className="btn sec sm" data-unknown={field} onClick={() => dispatch({ type: "setUnknown", txId: tx.id, field })}>{t("dontKnow")}</button>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------- uploads

function Uploads({ c, dispatch, onRead }: { c: CaseState; dispatch: Dispatch<Action>; onRead: (img: ImageRec) => void }) {
  const t = useT();
  const [errors, setErrors] = useState<string[]>([]);
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (files: File[]) => {
    setBusy(true);
    setErrors([]);
    const errs: string[] = [];
    let room = LIMITS.images - c.images.length;
    for (const file of files) {
      if (room <= 0) break;
      try {
        const p = await prepareImage(file); // one at a time keeps phone memory low
        if (p.dark) setDark(true);
        dispatch({ type: "addImage", image: { id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(p.blob), blob: p.blob, width: p.width, height: p.height } });
        room--;
      } catch (e) {
        const key = `imgErr_${e instanceof ImageError ? e.message : "unreadable"}`;
        errs.push(`${file.name}: ${isStringKey(key) ? t(key) : t("imgErr_unreadable")}`);
      }
    }
    setErrors(errs);
    setBusy(false);
  };

  const errText = (code: string | null) => {
    if (!code) return "";
    const key = `ocrErr_${code}`;
    if (isStringKey(key)) return t(key);
    if (["IMAGE_TOO_LARGE", "INVALID_IMAGE", "UNSUPPORTED_MEDIA"].includes(code)) return t("ocrErr_IMAGE");
    if (code === "LEFT") return t("img_unavailable");
    return t("ocrErr_OTHER");
  };

  return (
    <Panel title={t("uploadTitle")} id="secU">
      <div className="pad">
        <p>{t("uploadIntro")}</p>
        {c.images.length < LIMITS.images && (
          <label className="drop">
            {busy ? "…" : <span>{t("ghPick")}</span>}
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="vh" disabled={busy}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void pick(files);
              }} />
          </label>
        )}
        <p className="muted">{t("ghPrivacy")}</p>
        {dark && <p className="warnline">{t("ghDarkImage")}</p>}
        {errors.map((e) => (
          <p key={e} role="alert" className="err">{e}</p>
        ))}

        {c.images.map((img) => (
          <div key={img.id} className="shot">
            <div className="shothead">
              <img src={img.url} alt={img.name} />
              <div>
                <p><b>{img.name}</b></p>
                <p className="muted">{img.width}×{img.height} · {Math.round(img.blob.size / 1024)} KB JPEG</p>
                <p aria-live="polite">
                  {img.state === "ready"
                    ? ""
                    : img.state === "unavailable"
                      ? errText(img.error)
                      : img.error === "EMPTY_REREAD"
                        ? t("img_reread_empty")
                        : t(`img_${img.state}` as StringKey)}
                </p>
              </div>
            </div>
            {img.state !== "sending" && (
              <label className="tick">
                <input type="checkbox" checked={img.consent} onChange={(e) => dispatch({ type: "consent", imageId: img.id, value: e.target.checked })} />
                <span>{t("consentLabel")}</span>
              </label>
            )}
            <div className="row">
              {img.state !== "sending" && (
                <button type="button" className="btn gold sm" disabled={!img.consent} onClick={() => onRead(img)}>
                  {img.extraction === "precomputed" ? t("runLive") : t("readImage")}
                </button>
              )}
              <button type="button" className="btn sec sm" onClick={() => dispatch({ type: "removeImage", imageId: img.id })}>{t("removeImage")}</button>
            </div>
            {img.extraction && <EvidenceDrawer image={img} origin={c.origin} />}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- info

const INFO: [keyof CaseState["info"], StringKey, "text" | "tel" | "url"][] = [
  ["name", "fName", "text"],
  ["phone", "fPhone", "tel"],
  ["suspects", "fSuspects", "tel"],
  ["links", "fLinks", "url"],
];
const DIGIT_KEYS = ["phone", "suspects", "ack"];

function CaseInfo({ c, dispatch }: { c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const set = (key: keyof CaseState["info"], value: string) => dispatch({ type: "info", key, value: DIGIT_KEYS.includes(key) ? asciiDigits(value) : value });
  return (
    <Panel title={t("secB")} id="secB">
      <div className="pad form">
        {INFO.map(([key, label, mode]) => (
          <label key={key}>
            {t(label)}
            <input id={`info-${key}`} inputMode={mode} autoComplete="off" value={c.info[key]} onChange={(e) => set(key, e.target.value)} />
          </label>
        ))}
        <label>
          {t("fStory")}
          <textarea id="info-story" rows={3} value={c.info.story} onChange={(e) => set("story", e.target.value)} />
        </label>
        <TranslateStory c={c} dispatch={dispatch} />
        <label>
          {t("fAck")}
          <input id="info-ack" maxLength={64} autoComplete="off" value={c.info.ack} onChange={(e) => set("ack", e.target.value)} />
        </label>
        <small>{t("fAckHelp")}</small>
        {c.excerpts.length > 0 && (
          <div id="excerpts">
            <b>{t("fEvidence")} ({c.excerpts.length}/{LIMITS.excerpts})</b>
            <ol>
              {c.excerpts.map((e, i) => (
                <li key={e}>
                  <span>{e}</span>{" "}
                  <button type="button" className="link" onClick={() => dispatch({ type: "removeExcerpt", index: i })}>{t("removeExcerpt")}</button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Panel>
  );
}

const INDIAN_SCRIPT = /[ऀ-෿]/u; // Devanagari to Malayalam: Hindi, Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam

/**
 * Optional: an English version of "what happened" for the cybercrime.gov.in complaint, from Amazon Translate.
 * Sent only after a tick for that one request; the person reads and edits the English before it is used.
 */
function TranslateStory({ c, dispatch }: { c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const story = c.info.story.trim();
  const english = c.info.storyEn;
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [from, setFrom] = useKept(`trFrom:${c.id}`, ""); // the story text the English was made from
  const latch = useRef(false);
  const caseId = useRef(c.id);
  caseId.current = c.id;
  const needs = INDIAN_SCRIPT.test(story);
  if (!needs && !english) return null;

  const run = async () => {
    if (latch.current || !consent || !story) return;
    latch.current = true;
    const startedFor = c.id;
    setBusy(true);
    setErr(null);
    const r = await postTranslate(story);
    latch.current = false;
    setBusy(false);
    setConsent(false); // another request needs a new tick
    if (startedFor !== caseId.current) return; // the case was cleared meanwhile: drop the result
    if (!r.ok) return setErr(r.code === "DAILY_LIMIT" ? "trLimit" : "trErr");
    setFrom(story);
    dispatch({ type: "info", key: "storyEn", value: r.text });
  };

  return (
    <div className="translate" id="translate">
      {needs && (
        <>
          <label className="tick">
            <input type="checkbox" id="trconsent" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t("trConsent")}</span>
          </label>
          <div className="row">
            <button type="button" className="btn sec sm" id="trbtn" disabled={!consent || busy} onClick={() => void run()}>
              {t(busy ? "trBusy" : english ? "trAgain" : "trButton")}
            </button>
          </div>
          {err && <p role="alert" className="err">{t(err)}</p>}
        </>
      )}
      {english && (
        <>
          <label>
            {t("trResult")}
            <textarea id="info-storyEn" lang="en" rows={4} value={english} onChange={(e) => dispatch({ type: "info", key: "storyEn", value: e.target.value })} />
          </label>
          <small className="muted">{t("trNote")}</small>
          {from !== "" && from !== story && <p className="warnline" role="status">{t("trStale")}</p>}
          <button type="button" className="link" id="trremove" onClick={() => (dispatch({ type: "info", key: "storyEn", value: "" }), setFrom(""))}>
            {t("trRemove")}
          </button>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- pack

const TABS = [["script", "tScript"], ["portal", "tPortal"], ["bank", "tBank"], ["print", "tPrint"]] as const;

/** Every output is built only from confirmed facts at one revision. */
function Outputs({ c }: { c: CaseState }) {
  const t = useT();
  const lang = useLang();
  const [tab, setTab] = usePlace("tab", "script", (v) => TABS.some(([k]) => k === v));
  const f = useMemo(() => facts(c), [c]);
  const suspects = splitList(c.info.suspects);
  const links = splitList(c.info.links);
  const script = useMemo(() => build1930Script(f, lang, suspects), [f, lang, c.info.suspects]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = useMemo(() => buildNcrpCards(f, suspects, links), [f, c.info.suspects, c.info.links]); // eslint-disable-line react-hooks/exhaustive-deps
  const email = useMemo(() => buildBankEmail(f), [f]);
  const bank = `Subject: ${email.subject}\n\n${email.body}`;
  const sheet = useMemo(() => buildSheet(f, suspects, links), [f, c.info.suspects, c.info.links]); // eslint-disable-line react-hooks/exhaustive-deps
  const synthetic = c.origin === "synthetic";
  const { printing, print } = usePrintPack();
  // A demo case prints its fixed scenario time; a real one the current time.
  const printedAt = useMemo(() => {
    const { date, time } = formatIst(c.scenarioClock ?? new Date().toISOString(), "en-IN");
    return `${date}, ${time}`;
  }, [c.scenarioClock, printing]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = [script, cards.map((cd) => [`## ${cd.title}`, ...cd.fields.map((x) => `${x.label}: ${x.value}`)].join("\n")).join("\n\n"), bank].join("\n\n----------\n\n");

  return (
    <Panel title={t("secC")} id="secC" extra={<span className="rev">{t("packRev", { n: f.rev })}</span>}>
      <div className="pad">
        <p className="muted">{t("packLive")}</p>
        {f.txs.length === 0 && <p className="warnline">{t("packEmpty")}</p>}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} onClick={() => setTab(k)}>{t(label)}</button>
        ))}
      </div>
      <div className="pad" role="tabpanel">
        {tab === "script" && (
          <>
            <div className="row">
              <ReadButton from={["src-script"]} />
              <CopyButton text={script} />
            </div>
            <pre className="doc" id="src-script" lang={lang}>{script}</pre>
          </>
        )}
        {tab === "portal" && (
          <>
            <p>{t("ncrpHelp")} {t("englishNote")}</p>
            {cards.map((card) => (
              <div key={card.title}>
                <h3 lang="en">{card.title}</h3>
                <table>
                  <tbody>
                    {card.fields.map((x) => (
                      <tr key={x.label}>
                        <th scope="row" lang="en">{x.label}</th>
                        <td lang="en">{x.value}</td>
                        <td className="act"><CopyButton text={x.value} name={x.label} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <p><Ext href="https://cybercrime.gov.in">{t("ncrpOpen")}</Ext></p>
          </>
        )}
        {tab === "bank" && (
          <>
            <p>{t("englishNote")}</p>
            <div className="row">
              <CopyButton text={bank} />
              <a className="btn sm" href={email.mailto}>{t("emailOpen")}</a>
            </div>
            <pre className="doc" lang="en">{bank}</pre>
          </>
        )}
        {tab === "print" && (
          <>
            <p>{t("printPackHelp")}</p>
            <div className="sheet-preview">
              <PackSheet sheet={sheet} synthetic={synthetic} printedAt={printedAt} />
            </div>
          </>
        )}
        <PrintPortal active={printing}>
          <PackSheet sheet={sheet} synthetic={synthetic} printedAt={printedAt} />
        </PrintPortal>
        <div className="row">
          <button type="button" className="btn sm" id="printpack" disabled={printing} onClick={() => print(sheetTitle(f.rev, synthetic))}>{t("printPack")}</button>
          <CopyButton text={all} label={t("copyAll")} />
          <button type="button" className="btn sec sm" id="download" onClick={() => saveFile(`\ufeff${all}`, "text/plain", "asli-ya-nakli-report.txt")}>{t("download")}</button>
        </div>
      </div>
    </Panel>
  );
}

function Attest({ c, dispatch }: { c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const keys: AttestKey[] = ["called1930", "submittedPortal", "contactedBank"];
  return (
    <Panel title={t("secD")} id="secD">
      <div className="pad" id="attest">
        {keys.map((k) => {
          const at = c.attest[k];
          return (
            <label className="tick" key={k}>
              <input id={`att-${k}`} type="checkbox" checked={at != null} onChange={(e) => dispatch({ type: "attest", key: k, on: e.target.checked })} />
              <span>
                {t(`attest_${k}` as StringKey)}
                {at != null && at !== c.factsRev && <em className="err">{t("attestStale", { n: at })}</em>}
              </span>
            </label>
          );
        })}
      </div>
    </Panel>
  );
}

/** A calendar file with fixed wording and the chosen time: no case details go into it. */
function Reminder() {
  const t = useT();
  const [when, setWhen] = useKept("remind", "");
  const input = useRef<HTMLInputElement>(null);
  const make = () => {
    const start = new Date(when);
    if (Number.isNaN(start.getTime())) {
      toast(t("errTime"));
      input.current?.focus();
      return;
    }
    saveFile(reminderIcs(start, t("remEv"), t("remN")), "text/calendar", "asli-ya-nakli-reminder.ics");
  };
  return (
    <Panel title={t("remT")}>
      <div className="pad remind">
        <label>
          {t("remL")}
          <input id="remind" ref={input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <button type="button" className="btn sec" onClick={make}>{t("remB")}</button>
      </div>
    </Panel>
  );
}

const EVIDENCE: StringKey[] = ["ev1", "ev2", "ev3", "ev4", "ev5"];

function Evidence({ caseId }: { caseId: string }) {
  const t = useT();
  const [done, setDone] = useKept<string[]>(`evidence:${caseId}`, []);
  return (
    <Panel title={t("secE")} id="secE">
      <div className="pad">
        {EVIDENCE.map((k) => (
          <label className="tick" key={k}>
            <input type="checkbox" checked={done.includes(k)} onChange={(e) => setDone(e.target.checked ? [...done, k] : done.filter((x) => x !== k))} />
            <span>{t(k)}</span>
          </label>
        ))}
        <small>{t("ticks")}</small>
      </div>
    </Panel>
  );
}
