// The family's case lives only in this browser tab's memory (v3). OCR proposes; only a person confirms.
// Every output (script, NCRP cards, bank email) is a pure projection of the confirmed facts.

export type FieldName =
  | "amountPaise"
  | "upiRef"
  | "bankRef"
  | "senderVpa"
  | "receiverVpa"
  | "bankName"
  | "occurredAt"
  | "direction"
  | "paymentStatus";

export const FIELD_ORDER: FieldName[] = [
  "amountPaise",
  "upiRef",
  "occurredAt",
  "receiverVpa",
  "direction",
  "paymentStatus",
  "bankName",
  "bankRef",
  "senderVpa",
];

export type Box = [number, number, number, number]; // basis points: left, top, right, bottom

export interface Candidate {
  id: string;
  field: FieldName;
  raw: string;
  value: string;
  label: string;
  confidenceBp: number;
  box: Box;
}

export interface Source {
  imageId: string;
  attemptId: string;
  candidateId: string;
  box: Box;
  raw: string;
  label: string;
  confidenceBp: number;
}

export type Field =
  | { state: "empty" }
  | { state: "unknown" }
  | { state: "proposed"; value: string; source: Source }
  | { state: "editing"; text: string; source: Source | null; error: string | null }
  | { state: "confirmed"; value: string; source: Source | null; method: "typed" | "accepted" | "corrected" };

export interface Transaction {
  id: string;
  imageIds: string[];
  fields: Record<FieldName, Field>;
}

export type Extraction = "live" | "precomputed";
export type ImageState = "ready" | "sending" | "reviewable" | "no-fields" | "unavailable";

export interface OcrMeta {
  requestId: string;
  region: string;
  build: string;
  timingsMs: { admission: number; provider: number; total: number };
  usedToday: number | null;
  dailyCap: number;
  warnings: string[];
}

export interface ImageRec {
  id: string;
  name: string;
  url: string; // object URL of the exact normalized JPEG that is (or would be) sent
  blob: Blob;
  width: number;
  height: number;
  consent: boolean;
  state: ImageState;
  attemptId: string | null; // the latest attempt, which alone may deliver a result
  poolAttemptId: string | null; // the attempt that produced the current candidates
  candidates: Candidate[];
  extraction: Extraction | null;
  meta: OcrMeta | null;
  error: string | null;
}

export type Origin = "personal" | "synthetic";
export type AttestKey = "called1930" | "submittedPortal" | "contactedBank";

export interface CaseState {
  id: string;
  generation: number;
  origin: Origin;
  scenarioClock: string | null; // fixed "now" for synthetic demo cases
  factsRev: number;
  factsSig: string;
  images: ImageRec[];
  txs: Transaction[];
  info: { name: string; phone: string; suspects: string; links: string; story: string; evidence: string; ack: string };
  attest: Record<AttestKey, number | null>;
}

export const LIMITS = { images: 3, txs: 12, text: 2000, story: 1000, ack: 64 } as const;

const uuid = () => crypto.randomUUID();

const emptyFields = (): Record<FieldName, Field> =>
  Object.fromEntries(FIELD_ORDER.map((f) => [f, { state: "empty" } as Field])) as Record<FieldName, Field>;

export const newTransaction = (imageIds: string[] = []): Transaction => ({ id: uuid(), imageIds, fields: emptyFields() });

export function newCase(origin: Origin, generation: number, scenarioClock: string | null = null): CaseState {
  const c: CaseState = {
    id: uuid(),
    generation,
    origin,
    scenarioClock,
    factsRev: 0,
    factsSig: "",
    images: [],
    txs: [],
    info: { name: "", phone: "", suspects: "", links: "", story: "", evidence: "", ack: "" },
    attest: { called1930: null, submittedPortal: null, contactedBank: null },
  };
  return withFacts(c);
}

// ------------------------------------------------------------------------------------------ validation

/** Digits typed in an Indian script (Devanagari, Bengali, Tamil, Telugu, Kannada, Malayalam) are read as 0-9. */
export const asciiDigits = (s: string) =>
  s.replace(/[\u0966-\u096f\u09e6-\u09ef\u0be6-\u0bef\u0c66-\u0c6f\u0ce6-\u0cef\u0d66-\u0d6f]/g, (d) => String((d.charCodeAt(0) & 0x7f) - 0x66));

/** Typed text -> canonical value, or an error key. Never rounds, never guesses. */
export function validate(field: FieldName, text: string): { value: string } | { error: string } {
  const t = asciiDigits(text.trim());
  if (!t) return { error: "errEmpty" };
  switch (field) {
    case "amountPaise": {
      const m = /^(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/i.exec(t);
      if (!m) return { error: "errAmount" };
      const paise = BigInt(m[1]!.replace(/,/g, "")) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
      if (paise < 1n || paise > 999_999_999_999n) return { error: "errAmount" };
      return { value: paise.toString() };
    }
    case "upiRef":
      return /^\d{12}$/.test(t.replace(/\s/g, "")) ? { value: t.replace(/\s/g, "") } : { error: "errUtr" };
    case "bankRef":
      return /^[\x21-\x7e]{1,64}$/.test(t) ? { value: t } : { error: "errRef" };
    case "senderVpa":
    case "receiverVpa": {
      const v = t.toLowerCase();
      return /^[a-z0-9._-]{1,100}@[a-z][a-z0-9.]{1,27}$/.test(v) && v.length <= 128 ? { value: v } : { error: "errVpa" };
    }
    case "bankName":
      return t.length <= 100 ? { value: t } : { error: "errTooLong" };
    case "occurredAt": {
      // <input type="datetime-local"> value, read as IST wall-clock time
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
      if (!m) return { error: "errTime" };
      return { value: m[6] ? `${t.slice(0, 19)}+05:30` : `${t.slice(0, 16)}+05:30` };
    }
    case "direction":
      return t === "outgoing" || t === "incoming" ? { value: t } : { error: "errChoose" };
    case "paymentStatus":
      return ["completed", "pending", "failed", "reversed"].includes(t) ? { value: t } : { error: "errChoose" };
  }
}

/** Canonical value -> text for an input box. */
export function toInput(field: FieldName, value: string): string {
  if (field === "amountPaise") {
    const p = BigInt(value);
    const r = p % 100n;
    return `${p / 100n}${r ? "." + r.toString().padStart(2, "0") : ""}`;
  }
  if (field === "occurredAt") return value.slice(0, value.length - 6);
  return value;
}

// ------------------------------------------------------------------------------------------ facts revision

/** True when a real (not demo) case holds anything a person would lose if it were replaced. */
export function hasDraft(c: CaseState): boolean {
  return (
    c.origin === "personal" &&
    (c.images.length > 0 ||
      c.txs.some((t) => FIELD_ORDER.some((f) => t.fields[f].state !== "empty")) ||
      Object.values(c.info).some((v) => v.trim() !== ""))
  );
}

/** Signature of everything that can appear in a report. factsRev moves only when this changes. */
function factsSignature(c: CaseState): string {
  return JSON.stringify([
    c.txs.map((t) => [t.id, FIELD_ORDER.map((f) => (t.fields[f].state === "confirmed" ? (t.fields[f] as { value: string }).value : null))]),
    c.info,
  ]);
}

function withFacts(c: CaseState): CaseState {
  const sig = factsSignature(c);
  return sig === c.factsSig ? c : { ...c, factsSig: sig, factsRev: c.factsSig === "" ? 0 : c.factsRev + 1 };
}

// ------------------------------------------------------------------------------------------ actions

export interface SeedImage {
  id: string;
  name: string;
  url: string;
  blob: Blob;
  width: number;
  height: number;
  candidates: Candidate[];
}

export type Action =
  | { type: "reset"; origin: Origin; scenarioClock?: string | null }
  | { type: "loadSeed"; clock: string; images: SeedImage[] }
  | { type: "addTx" }
  | { type: "removeTx"; txId: string }
  | { type: "addImage"; image: Omit<ImageRec, "consent" | "state" | "attemptId" | "poolAttemptId" | "candidates" | "extraction" | "meta" | "error"> }
  | { type: "consent"; imageId: string; value: boolean }
  | { type: "removeImage"; imageId: string }
  | { type: "sending"; generation: number; imageId: string; attemptId: string }
  | { type: "ocrResult"; generation: number; imageId: string; attemptId: string; candidates: Candidate[]; meta: OcrMeta | null; extraction: Extraction }
  | { type: "ocrFailed"; generation: number; imageId: string; attemptId: string; code: string }
  | { type: "revokePending" }
  | { type: "propose"; txId: string; field: FieldName; candidate: Candidate; imageId: string }
  | { type: "accept"; txId: string; field: FieldName }
  | { type: "edit"; txId: string; field: FieldName; text: string }
  | { type: "confirmEdit"; txId: string; field: FieldName }
  | { type: "cancelEdit"; txId: string; field: FieldName }
  | { type: "setUnknown"; txId: string; field: FieldName }
  | { type: "info"; key: keyof CaseState["info"]; value: string }
  | { type: "attest"; key: AttestKey; on: boolean };

function updateTx(c: CaseState, txId: string, fn: (t: Transaction) => Transaction): CaseState {
  return { ...c, txs: c.txs.map((t) => (t.id === txId ? fn(t) : t)) };
}

function setField(t: Transaction, field: FieldName, f: Field): Transaction {
  return { ...t, fields: { ...t.fields, [field]: f } };
}

function updateImage(c: CaseState, imageId: string, fn: (i: ImageRec) => ImageRec): CaseState {
  return { ...c, images: c.images.map((i) => (i.id === imageId ? fn(i) : i)) };
}

/** Removing evidence withdraws every field that depended on it; independently typed facts survive. */
function dropSource(t: Transaction, imageId: string): Transaction {
  const fields = { ...t.fields };
  // A corrected value, or one being edited from a reading, still depends on that screenshot (spec §4, R3-A02).
  for (const f of FIELD_ORDER) {
    const v = fields[f];
    if ("source" in v && v.source?.imageId === imageId) fields[f] = { state: "empty" };
  }
  return { ...t, fields, imageIds: t.imageIds.filter((id) => id !== imageId) };
}

function applyResult(c: CaseState, image: ImageRec, candidates: Candidate[], attemptId: string): CaseState {
  // One transaction per screenshot by default; the top candidate per field becomes a *proposal* only.
  let tx = c.txs.find((t) => t.imageIds.includes(image.id));
  let txs = c.txs;
  if (!tx) {
    const blank = c.txs.find((t) => t.imageIds.length === 0 && FIELD_ORDER.every((f) => t.fields[f].state === "empty"));
    tx = blank ? { ...blank, imageIds: [image.id] } : newTransaction([image.id]);
    txs = blank ? c.txs.map((t) => (t.id === blank.id ? tx! : t)) : [...c.txs, tx].slice(0, LIMITS.txs);
  }
  const seen = new Set<FieldName>();
  let updated = tx;
  for (const cand of candidates) {
    if (seen.has(cand.field)) continue;
    seen.add(cand.field);
    if (updated.fields[cand.field].state !== "empty") continue; // never overwrite anything the person touched
    updated = setField(updated, cand.field, {
      state: "proposed",
      value: cand.value,
      source: { imageId: image.id, attemptId, candidateId: cand.id, box: cand.box, raw: cand.raw, label: cand.label, confidenceBp: cand.confidenceBp },
    });
  }
  return { ...c, txs: txs.map((t) => (t.id === updated.id ? updated : t)) };
}

function reduceInner(c: CaseState, a: Action): CaseState {
  switch (a.type) {
    case "reset":
      c.images.forEach((i) => URL.revokeObjectURL(i.url));
      return newCase(a.origin, c.generation + 1, a.scenarioClock ?? null);
    case "loadSeed": {
      // Atomic: a fresh synthetic case with precomputed readings. Loading again simply replaces it.
      let s = reduceInner(c, { type: "reset", origin: "synthetic", scenarioClock: a.clock });
      for (const img of a.images) {
        const attemptId = uuid();
        s = reduceInner(s, { type: "addImage", image: { id: img.id, name: img.name, url: img.url, blob: img.blob, width: img.width, height: img.height } });
        s = reduceInner(s, { type: "consent", imageId: img.id, value: true });
        s = reduceInner(s, { type: "sending", generation: s.generation, imageId: img.id, attemptId });
        s = reduceInner(s, { type: "ocrResult", generation: s.generation, imageId: img.id, attemptId, candidates: img.candidates, meta: null, extraction: "precomputed" });
      }
      return s;
    }
    case "addTx":
      return c.txs.length >= LIMITS.txs ? c : { ...c, txs: [...c.txs, newTransaction()] };
    case "removeTx":
      return { ...c, txs: c.txs.filter((t) => t.id !== a.txId) };
    case "addImage":
      if (c.images.length >= LIMITS.images) return c;
      return {
        ...c,
        images: [...c.images, { ...a.image, consent: false, state: "ready", attemptId: null, poolAttemptId: null, candidates: [], extraction: null, meta: null, error: null }],
      };
    case "consent":
      return updateImage(c, a.imageId, (i) => (i.state === "sending" ? i : { ...i, consent: a.value }));
    case "removeImage": {
      const img = c.images.find((i) => i.id === a.imageId);
      if (img) URL.revokeObjectURL(img.url);
      return { ...c, images: c.images.filter((i) => i.id !== a.imageId), txs: c.txs.map((t) => dropSource(t, a.imageId)) };
    }
    case "sending": {
      const img = c.images.find((i) => i.id === a.imageId);
      if (a.generation !== c.generation || !img || !img.consent || img.state === "sending") return c;
      // Starting an attempt changes no facts: the last reading stays until a new one actually replaces it.
      return updateImage(c, img.id, (i) => ({ ...i, state: "sending", attemptId: a.attemptId, error: null }));
    }
    case "ocrResult": {
      const img = c.images.find((i) => i.id === a.imageId);
      // Ownership check: same case generation, same image, same attempt, still waiting. Otherwise drop it.
      if (a.generation !== c.generation || !img || img.state !== "sending" || img.attemptId !== a.attemptId) return c;
      // consent: false, because another paid attempt needs a new, explicit tick.
      if (!a.candidates.length) {
        // An empty reading replaces nothing: an earlier pool keeps its own timings and provenance.
        const first = !img.candidates.length;
        return updateImage(c, img.id, (i) => ({
          ...i, state: "no-fields", consent: false, ...(first ? { meta: a.meta, extraction: a.extraction } : {}),
        }));
      }
      const done: ImageRec = {
        ...img,
        state: "reviewable",
        candidates: a.candidates,
        poolAttemptId: a.attemptId,
        meta: a.meta,
        extraction: a.extraction,
        consent: false,
      };
      // The candidate pool is replaced now, so facts that depended on the old pool are withdrawn.
      const txs = c.txs.map((t) => ({ ...dropSource(t, img.id), imageIds: t.imageIds }));
      return applyResult(updateImage({ ...c, txs }, img.id, () => done), done, a.candidates, a.attemptId);
    }
    case "ocrFailed":
      if (a.generation !== c.generation) return c;
      return updateImage(c, a.imageId, (i) =>
        i.state === "sending" && i.attemptId === a.attemptId ? { ...i, state: "unavailable", consent: false, error: a.code } : i,
      );
    case "revokePending":
      return { ...c, images: c.images.map((i) => (i.state === "sending" ? { ...i, state: "unavailable", consent: false, error: "LEFT" } : i)) };
    case "propose": {
      const img = c.images.find((i) => i.id === a.imageId);
      const attemptId = img?.poolAttemptId;
      if (!img || !attemptId) return c;
      // A candidate supports at most one field at a time: take it away from wherever it was used.
      const cleared = {
        ...c,
        txs: c.txs.map((t) => {
          const fields = { ...t.fields };
          for (const f of FIELD_ORDER) {
            const v = fields[f];
            if ("source" in v && v.source?.imageId === img.id && v.source.candidateId === a.candidate.id) fields[f] = { state: "empty" };
          }
          return { ...t, fields };
        }),
      };
      return updateTx(cleared, a.txId, (t) => {
        return setField({ ...t, imageIds: t.imageIds.includes(img.id) ? t.imageIds : [...t.imageIds, img.id] }, a.field, {
          state: "proposed",
          value: a.candidate.value,
          source: {
            imageId: img.id,
            attemptId,
            candidateId: a.candidate.id,
            box: a.candidate.box,
            raw: a.candidate.raw,
            label: a.candidate.label,
            confidenceBp: a.candidate.confidenceBp,
          },
        });
      });
    }
    case "accept":
      return updateTx(c, a.txId, (t) => {
        const f = t.fields[a.field];
        return f.state === "proposed" ? setField(t, a.field, { state: "confirmed", value: f.value, source: f.source, method: "accepted" }) : t;
      });
    case "edit":
      return updateTx(c, a.txId, (t) => {
        const f = t.fields[a.field];
        const source = "source" in f ? f.source : null;
        // Starting an edit withdraws the old value from every output immediately.
        return setField(t, a.field, { state: "editing", text: a.text.slice(0, 256), source, error: null });
      });
    case "confirmEdit":
      return updateTx(c, a.txId, (t) => {
        const f = t.fields[a.field];
        if (f.state !== "editing") return t;
        const r = validate(a.field, f.text);
        if ("error" in r) return setField(t, a.field, { ...f, error: r.error });
        const method = f.source ? (f.source.raw && r.value === candidateValue(f.source, c) ? "accepted" : "corrected") : "typed";
        return setField(t, a.field, { state: "confirmed", value: r.value, source: f.source, method });
      });
    case "cancelEdit":
      return updateTx(c, a.txId, (t) => {
        const f = t.fields[a.field];
        if (f.state !== "editing") return t;
        // Restore only a still-valid source proposal; a typed predecessor must be typed again.
        const cand = f.source && c.images.find((i) => i.id === f.source!.imageId)?.candidates.find((k) => k.id === f.source!.candidateId);
        return setField(t, a.field, cand && f.source ? { state: "proposed", value: cand.value, source: f.source } : { state: "empty" });
      });
    case "setUnknown":
      return updateTx(c, a.txId, (t) => setField(t, a.field, { state: "unknown" }));
    case "info": {
      const max = a.key === "story" ? LIMITS.story : a.key === "ack" ? LIMITS.ack : LIMITS.text;
      if (a.value.length > 2 * max) return c; // cheap guard before anything else
      return { ...c, info: { ...c.info, [a.key]: [...a.value].slice(0, max).join("") } };
    }
    case "attest":
      return { ...c, attest: { ...c.attest, [a.key]: a.on ? c.factsRev : null } };
  }
}

function candidateValue(source: Source, c: CaseState): string | null {
  return c.images.find((i) => i.id === source.imageId)?.candidates.find((k) => k.id === source.candidateId)?.value ?? null;
}

export function reducer(c: CaseState, a: Action): CaseState {
  return withFacts(reduceInner(c, a));
}

// ------------------------------------------------------------------------------------------ projection

export interface FactsTx {
  id: string;
  amountPaise: bigint | null;
  upiRef: string;
  bankRef: string;
  senderVpa: string;
  receiverVpa: string;
  bankName: string;
  occurredAt: string | null;
  direction: string;
  paymentStatus: string;
}

export interface Facts {
  rev: number;
  txs: FactsTx[];
  info: CaseState["info"];
}

/** The only view outputs may read: confirmed values at one revision. Chronological; unknown times last. */
export function facts(c: CaseState): Facts {
  const val = (t: Transaction, f: FieldName) => {
    const v = t.fields[f];
    return v.state === "confirmed" ? v.value : "";
  };
  const txs = c.txs.map((t) => ({
    id: t.id,
    amountPaise: val(t, "amountPaise") ? BigInt(val(t, "amountPaise")) : null,
    upiRef: val(t, "upiRef"),
    bankRef: val(t, "bankRef"),
    senderVpa: val(t, "senderVpa"),
    receiverVpa: val(t, "receiverVpa"),
    bankName: val(t, "bankName"),
    occurredAt: val(t, "occurredAt") || null,
    direction: val(t, "direction"),
    paymentStatus: val(t, "paymentStatus"),
  }));
  const order = new Map(c.txs.map((t, i) => [t.id, i]));
  txs.sort((a, b) => {
    if (a.occurredAt && b.occurredAt) return Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
    if (a.occurredAt) return -1;
    if (b.occurredAt) return 1;
    return order.get(a.id)! - order.get(b.id)!;
  });
  return { rev: c.factsRev, txs, info: c.info };
}

export const isCompletedOutgoing = (t: FactsTx) => t.direction === "outgoing" && t.paymentStatus === "completed";

/** A payment that may have left the account and carries a confirmed detail a bank could trace. */
export const canBeHeld = (t: FactsTx) =>
  t.direction === "outgoing" && t.paymentStatus !== "failed" && t.paymentStatus !== "reversed" && !!(t.upiRef || t.bankRef || t.receiverVpa);

export function unresolvedCount(c: CaseState): number {
  return c.txs.reduce((n, t) => n + FIELD_ORDER.filter((f) => t.fields[f].state === "proposed" || t.fields[f].state === "editing").length, 0);
}
