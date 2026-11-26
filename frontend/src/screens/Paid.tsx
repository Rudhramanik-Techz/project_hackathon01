// Golden Hour (v3): call first, type or read screenshots, confirm every field against its source, then one
// revision-bound pack. OCR only ever proposes; nothing reaches the pack until the person confirms it.
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from "react";
import { postOcr } from "../api";
import {
  type Action,
  type AttestKey,
  type CaseState,
  FIELD_ORDER,
  type FieldName,
  type ImageRec,
  LIMITS,
  type Transaction,
  facts,
  toInput,
  unresolvedCount,
} from "../case/model";
import { CopyButton } from "../components/CopyButton";
import { Crop } from "../components/Crop";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { AlertIcon, BeakerIcon, ClockIcon, ExternalIcon, LockIcon, MailIcon, PhoneIcon, UploadIcon } from "../components/Icons";
import { isStringKey, useLang, useT, type Lang, type StringKey } from "../i18n";
import { formatIst, formatPaise, minutesSince, spaceDigits, splitList } from "../lib/format";
import { ImageError, prepareImage } from "../lib/image";
import { buildBankEmail } from "../pack/email";
import { buildNcrpCards } from "../pack/ncrp";
import { build1930Script } from "../pack/script";

const PACE_MS = 1100; // gap between distinct images after a response, so one tab never hits the 1/s bucket
const INPUT = "mt-1 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base";
const ENUMS: Partial<Record<FieldName, string[]>> = {
  direction: ["outgoing", "incoming"],
  paymentStatus: ["completed", "pending", "failed", "reversed"],
};
const ENUM_PREFIX: Partial<Record<FieldName, string>> = { direction: "dir_", paymentStatus: "st_" };
const SECONDARY: FieldName[] = ["bankRef", "senderVpa"];

function useNow(fixed: string | null): number {
  const [now, setNow] = useState(() => (fixed ? Date.parse(fixed) : Date.now()));
  useEffect(() => {
    if (fixed) return setNow(Date.parse(fixed));
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [fixed]);
  return now;
}

function display(field: FieldName, value: string, t: (k: StringKey) => string, lang: Lang): string {
  if (field === "amountPaise") return formatPaise(BigInt(value));
  if (field === "upiRef") return spaceDigits(value);
  if (field === "occurredAt") {
    const { date, time } = formatIst(value, lang === "en" ? "en-IN" : `${lang}-IN`, lang === "en");
    return `${date}, ${time}`;
  }
  const key = `${ENUM_PREFIX[field] ?? ""}${value}`;
  return ENUM_PREFIX[field] && isStringKey(key) ? t(key) : value;
}

// ------------------------------------------------------------------------------------------------ screen

export function Paid({ c, dispatch }: { c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const controllers = useRef(new Map<string, AbortController>());
  const latch = useRef(new Set<string>());
  const lastResponse = useRef(0);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {c.origin === "synthetic" && (
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-900">
              <BeakerIcon size={14} />{t("syntheticBanner")}
            </p>
          )}
          <h1 className="text-2xl font-bold sm:text-3xl">{t("ghTitle")}</h1>
          <p className="mt-1 text-slate-600">{t("callFirst")}</p>
        </div>
        <button type="button"
          onClick={() => window.confirm(t("clearConfirm")) && dispatch({ type: "reset", origin: "personal" })}
          className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">
          {t("clearCase")}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] xl:gap-8 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <CallCard className="lg:hidden" />
          <Payments c={c} dispatch={dispatch} />
          <Uploads c={c} dispatch={dispatch} onRead={read} />
          <CaseInfo c={c} dispatch={dispatch} />
        </div>
        {/* Live pack: sticky beside the form on desktop, so every confirmation visibly updates it. */}
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pb-2 lg:pr-1">
          <CallCard className="hidden lg:block" />
          <PackView c={c} dispatch={dispatch} />
        </aside>
      </div>
    </div>
  );
}

function CallCard({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <section className={`rounded-xl bg-red-700 p-4 text-white ${className}`}>
      <a href="tel:1930" className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-white text-lg font-bold text-red-800">
        <PhoneIcon />{t("call1930")}
      </a>
      <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer noopener"
        className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white underline">
        {t("ncrpOpen")}<ExternalIcon size={14} />
      </a>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- payments

function Payments({ c, dispatch }: { c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const now = useNow(c.scenarioClock);
  const pending = unresolvedCount(c);
  return (
    <section aria-labelledby="payments-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="payments-h" className="text-xl font-bold">{t("paymentsTitle")}</h2>
        {pending > 0 && <span className="rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-900">{t("unresolved", { n: pending })}</span>}
      </div>
      {c.txs.length === 0 && <p className="text-slate-600">{t("noPayments")}</p>}
      {c.txs.map((tx, i) => (
        <PaymentCard key={tx.id} tx={tx} index={i} c={c} dispatch={dispatch} now={now} />
      ))}
      {c.txs.length < LIMITS.txs && (
        <button type="button" onClick={() => dispatch({ type: "addTx" })}
          className="min-h-12 rounded-xl border-2 border-dashed border-slate-400 bg-white font-semibold">
          + {t("addTx")}
        </button>
      )}
    </section>
  );
}

function PaymentCard({ tx, index, c, dispatch, now }: { tx: Transaction; index: number; c: CaseState; dispatch: Dispatch<Action>; now: number }) {
  const t = useT();
  const when = tx.fields.occurredAt;
  const mins = when.state === "confirmed" ? minutesSince(when.value, now) : null;
  const [more, setMore] = useState(false);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4" aria-label={t("txN", { n: index + 1 })}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{t("txN", { n: index + 1 })}</h3>
        {mins != null && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-sm font-semibold text-red-800"><ClockIcon size={14} />{t("elapsed", { i: index + 1, m: mins })}</span>}
      </header>
      {FIELD_ORDER.filter((f) => more || !SECONDARY.includes(f)).map((f) => (
        <FieldRow key={f} tx={tx} field={f} c={c} dispatch={dispatch} />
      ))}
      <div className="mt-3 flex flex-wrap justify-between gap-2">
        <button type="button" onClick={() => setMore(!more)} className="text-sm font-semibold text-sky-800 underline">
          {more ? "−" : "+"} {t("f_bankRef")} / {t("f_senderVpa")}
        </button>
        <button type="button" onClick={() => dispatch({ type: "removeTx", txId: tx.id })} className="text-sm font-semibold text-red-700 underline">
          {t("removeTx")}
        </button>
      </div>
    </article>
  );
}

function FieldRow({ tx, field, c, dispatch }: { tx: Transaction; field: FieldName; c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const lang = useLang();
  const f = tx.fields[field];
  const label = t(`f_${field}` as StringKey);
  const options = ENUMS[field];
  const source = "source" in f ? f.source : null;
  const img = source ? c.images.find((i) => i.id === source.imageId) : null;
  const usedIds = new Set(
    c.txs.flatMap((x) => FIELD_ORDER.map((k) => x.fields[k]).flatMap((v) => ("source" in v && v.source ? [`${v.source.imageId}/${v.source.candidateId}`] : []))),
  );
  const others = c.images
    .filter((i) => tx.imageIds.includes(i.id))
    .flatMap((i) => i.candidates.filter((k) => k.field === field && !usedIds.has(`${i.id}/${k.id}`)).map((k) => ({ img: i, k })));
  const choose = (value: string) => {
    dispatch({ type: "edit", txId: tx.id, field, text: value });
    dispatch({ type: "confirmEdit", txId: tx.id, field });
  };
  const status =
    f.state === "proposed" ? t("fs_proposed") : f.state === "confirmed" ? t(`fs_${f.method}` as StringKey) : f.state === "unknown" ? t("fs_unknown") : f.state === "editing" ? t("fs_editing") : "";
  const tone =
    f.state === "proposed" ? "border-amber-400 bg-amber-50" : f.state === "confirmed" ? "border-emerald-300 bg-emerald-50/50" : f.state === "editing" ? "border-sky-400 bg-sky-50" : "border-slate-200";

  return (
    <div className={`mt-3 rounded-xl border p-3 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        {status && <span className="text-xs text-slate-600">{status}</span>}
      </div>

      {(f.state === "proposed" || f.state === "confirmed") && (
        <p className={`mt-1 text-xl font-bold tabular-nums ${field === "upiRef" || field === "bankRef" ? "break-all" : "break-words"}`}>{display(field, f.value, t, lang)}</p>
      )}
      {source && img && f.state !== "editing" && (
        <>
          <Crop url={img.url} width={img.width} height={img.height} box={source.box} label={`${label}: ${source.raw}`} />
          <p className="mt-1 text-xs text-slate-600">
            “{source.raw}”{source.label ? ` · ${source.label}` : ""}
            {source.confidenceBp < 9000 ? ` · ⚠ ${t("hardToRead")}` : ""}
          </p>
        </>
      )}

      {f.state === "editing" && (
        <div className="mt-1">
          {options ? (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => (
                <button key={o} type="button" onClick={() => choose(o)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
                  {t(`${ENUM_PREFIX[field]}${o}` as StringKey)}
                </button>
              ))}
            </div>
          ) : (
            <input
              aria-label={label}
              type={field === "occurredAt" ? "datetime-local" : "text"}
              inputMode={field === "amountPaise" ? "decimal" : field === "upiRef" ? "numeric" : undefined}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={f.text}
              onChange={(e) => dispatch({ type: "edit", txId: tx.id, field, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && dispatch({ type: "confirmEdit", txId: tx.id, field })}
              aria-invalid={!!f.error}
              aria-describedby={f.error ? `${tx.id}-${field}-err` : undefined}
              className={INPUT}
              autoFocus
            />
          )}
          {f.error && (
            <p id={`${tx.id}-${field}-err`} role="alert" className="mt-1 text-sm text-red-700">
              {isStringKey(f.error) ? t(f.error) : f.error}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {f.state === "proposed" && <Btn primary onClick={() => dispatch({ type: "accept", txId: tx.id, field })}>✓ {t("accept")}</Btn>}
        {f.state === "editing" && !options && <Btn primary onClick={() => dispatch({ type: "confirmEdit", txId: tx.id, field })}>{t("confirm")}</Btn>}
        {f.state === "editing" && <Btn onClick={() => dispatch({ type: "cancelEdit", txId: tx.id, field })}>{t("cancel")}</Btn>}
        {(f.state === "proposed" || f.state === "confirmed") && (
          <Btn onClick={() => dispatch({ type: "edit", txId: tx.id, field, text: toInput(field, f.value) })}>{t("edit")}</Btn>
        )}
        {(f.state === "empty" || f.state === "unknown") && <Btn onClick={() => dispatch({ type: "edit", txId: tx.id, field, text: "" })}>{t("typeIt")}</Btn>}
        {f.state !== "unknown" && f.state !== "editing" && f.state !== "confirmed" && (
          <Btn onClick={() => dispatch({ type: "setUnknown", txId: tx.id, field })}>{t("dontKnow")}</Btn>
        )}
      </div>

      {others.length > 0 && f.state !== "editing" && (
        <div className="mt-2">
          <p className="text-xs text-slate-600">{t("otherReadings")}:</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {others.map(({ img: i, k }) => (
              <button key={`${i.id}/${k.id}`} type="button"
                onClick={() => dispatch({ type: "propose", txId: tx.id, field, candidate: k, imageId: i.id })}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm">
                {display(field, k.value, t, lang)}
                {k.label ? <span className="text-slate-500"> · {k.label}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Btn({ children, onClick, primary = false }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`min-h-11 rounded-lg px-3 font-semibold ${primary ? "bg-emerald-700 text-white" : "border border-slate-300 bg-white text-slate-800"}`}>
      {children}
    </button>
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
    <section aria-labelledby="upload-h" className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 id="upload-h" className="text-lg font-bold">{t("uploadTitle")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("uploadIntro")}</p>
      {c.images.length < LIMITS.images && (
        <label className="mt-3 flex min-h-16 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-400 p-3 font-semibold">
          {busy ? "…" : <span className="flex items-center gap-2"><UploadIcon />{t("ghPick")}</span>}
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void pick(files);
            }} />
        </label>
      )}
      <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600"><LockIcon size={14} className="mt-0.5 shrink-0" />{t("ghPrivacy")}</p>
      {dark && <p className="mt-1 text-sm text-amber-800">{t("ghDarkImage")}</p>}
      {errors.map((e) => (
        <p key={e} role="alert" className="mt-1 text-sm text-red-700">{e}</p>
      ))}

      {c.images.map((img) => (
        <div key={img.id} className="mt-4 rounded-xl border border-slate-200 p-3">
          <div className="flex gap-3">
            <img src={img.url} alt={img.name} className="h-28 w-auto rounded border border-slate-200 object-contain" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-semibold">{img.name}</p>
              <p className="text-slate-500">{img.width}×{img.height} · {Math.round(img.blob.size / 1024)} KB JPEG</p>
              <p className="mt-1" aria-live="polite">
                {img.state === "ready" ? "" : img.state === "unavailable" ? errText(img.error) : t(`img_${img.state}` as StringKey)}
              </p>
            </div>
          </div>
          {img.state !== "sending" && (
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={img.consent}
                onChange={(e) => dispatch({ type: "consent", imageId: img.id, value: e.target.checked })} />
              {t("consentLabel")}
            </label>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {img.state !== "sending" && (
              <button type="button" disabled={!img.consent} onClick={() => onRead(img)}
                className="min-h-11 rounded-lg bg-amber-500 px-3 font-bold text-slate-950 disabled:opacity-40">
                {img.extraction === "precomputed" ? t("runLive") : t("readImage")}
              </button>
            )}
            <button type="button" onClick={() => dispatch({ type: "removeImage", imageId: img.id })}
              className="min-h-11 rounded-lg border border-slate-300 px-3">
              {t("removeImage")}
            </button>
          </div>
          {img.extraction && <EvidenceDrawer image={img} origin={c.origin} />}
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- info

function CaseInfo({ c, dispatch }: { c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const fields: [keyof CaseState["info"], StringKey, string][] = [
    ["name", "fName", "text"],
    ["phone", "fPhone", "tel"],
    ["suspects", "fSuspects", "text"],
    ["links", "fLinks", "text"],
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold">{t("caseTitle")}</h2>
      {fields.map(([key, label, type]) => (
        <label key={key} className="mt-3 block">
          <span className="text-sm font-medium text-slate-700">{t(label)}</span>
          <input type={type} value={c.info[key]} onChange={(e) => dispatch({ type: "info", key, value: e.target.value })} className={INPUT} />
        </label>
      ))}
      <label className="mt-3 block">
        <span className="text-sm font-medium text-slate-700">{t("fStory")}</span>
        <textarea rows={3} value={c.info.story} onChange={(e) => dispatch({ type: "info", key: "story", value: e.target.value })} className={INPUT} />
      </label>
      {c.info.evidence && (
        <label className="mt-3 block">
          <span className="text-sm font-medium text-slate-700">{t("fEvidence")}</span>
          <textarea rows={3} value={c.info.evidence} onChange={(e) => dispatch({ type: "info", key: "evidence", value: e.target.value })} className={INPUT} />
        </label>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- pack

function PackView({ c, dispatch }: { c: CaseState; dispatch: Dispatch<Action> }) {
  const t = useT();
  const lang = useLang();
  const f = useMemo(() => facts(c), [c]);
  const suspects = splitList(c.info.suspects);
  const links = splitList(c.info.links);
  const script = useMemo(() => build1930Script(f, lang, suspects), [f, lang, c.info.suspects]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = useMemo(() => buildNcrpCards(f, suspects, links), [f, c.info.suspects, c.info.links]); // eslint-disable-line react-hooks/exhaustive-deps
  const email = useMemo(() => buildBankEmail(f), [f]);
  const all = [script, cards.map((cd) => [`## ${cd.title}`, ...cd.fields.map((x) => `${x.label}: ${x.value}`)].join("\n")).join("\n\n"), `Subject: ${email.subject}\n\n${email.body}`].join("\n\n----------\n\n");
  const keys: AttestKey[] = ["called1930", "submittedPortal", "contactedBank"];

  return (
    <section aria-labelledby="pack-h" className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pack-h" className="text-xl font-bold">{t("packTitle")}</h2>
          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">{t("packRev", { n: f.rev })}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">{t("packLive")}</p>
        <p className="mt-1 text-sm text-slate-600">{t("elapsedHint")}</p>
        {f.txs.length === 0 && <p className="mt-1 text-sm text-amber-800">{t("packEmpty")}</p>}
      </div>

      <Card title={t("scriptTitle")} copy={script}>
        <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-slate-950">{script}</p>
      </Card>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="font-semibold">{t("fAck")}</span>
          <input value={c.info.ack} maxLength={64} onChange={(e) => dispatch({ type: "info", key: "ack", value: e.target.value })} className={INPUT} />
          <span className="mt-1 block text-sm text-slate-600">{t("fAckHelp")}</span>
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-lg font-bold">{t("ncrpTitle")}</h3>
        <p className="text-sm text-slate-600">{t("ncrpHelp")}</p>
        <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 font-semibold underline">
          {t("ncrpOpen")}<ExternalIcon size={14} className="ml-1.5" />
        </a>
        {cards.map((card) => (
          <div key={card.title} className="mt-4">
            <h4 className="font-semibold text-slate-800">{card.title}</h4>
            <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {card.fields.map((x) => (
                <li key={x.label} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">{x.label}</div>
                    <div className="select-all break-words">{x.value}</div>
                  </div>
                  <CopyButton text={x.value} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <Card title={t("emailTitle")} copy={`Subject: ${email.subject}\n\n${email.body}`}>
        <p className="mt-2 font-semibold">{email.subject}</p>
        <p className="mt-2 select-all whitespace-pre-wrap text-sm">{email.body}</p>
        <a href={email.mailto} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 font-semibold"><MailIcon size={16} className="mr-1.5" />{t("emailOpen")}</a>
      </Card>

      <CopyButton text={all} label={t("copyAll")} big />

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold">{t("attestTitle")}</h3>
        {keys.map((k) => {
          const at = c.attest[k];
          return (
            <div key={k} className="mt-2">
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="h-5 w-5" checked={at != null} onChange={(e) => dispatch({ type: "attest", key: k, on: e.target.checked })} />
                {t(`attest_${k}` as StringKey)}
              </label>
              {at != null && at !== c.factsRev && <p className="ml-7 flex items-start gap-1.5 text-sm text-amber-800"><AlertIcon size={16} className="mt-0.5 shrink-0" />{t("attestStale", { n: at })}</p>}
            </div>
          );
        })}
      </section>
    </section>
  );
}

function Card({ title, copy, children }: { title: string; copy: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold">{title}</h3>
        <CopyButton text={copy} />
      </div>
      {children}
    </section>
  );
}
