// v3 API client. Relative /api/v3 paths: Vite proxy locally, CloudFront on AWS.
// No automatic retries anywhere (a retry could buy a second paid OCR call). Every response is validated
// strictly before it can touch the case; anything unexpected becomes one recoverable failure code.
import { FIELD_ORDER, type Candidate, type FieldName, type OcrMeta } from "./case/model";

export const OCR_TIMEOUT_MS = 9_000;
const MAX_RESPONSE_BYTES = 32_768;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type Failure = { ok: false; code: string };

async function readJson(res: Response): Promise<unknown> {
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > MAX_RESPONSE_BYTES) throw new Error("too large");
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) throw new Error("not json");
  const text = await res.text();
  if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) throw new Error("too large");
  return JSON.parse(text);
}

function errorCode(body: unknown, status: number): string {
  const e = (body as { v?: number; error?: { code?: unknown } } | null)?.error;
  return typeof e?.code === "string" && /^[A-Z_]{3,32}$/.test(e.code) ? e.code : `HTTP_${status}`;
}

function withTimeout(ms: number, outer?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener("abort", onOuter);
  return { signal: ctrl.signal, done: () => (clearTimeout(timer), outer?.removeEventListener("abort", onOuter)) };
}

export interface Health {
  v: 3;
  build: string;
  status: "ok";
  region: string;
}

export async function getHealth(): Promise<Health | null> {
  const t = withTimeout(5_000);
  try {
    const res = await fetch("/api/v3/health", { signal: t.signal, cache: "no-store" });
    const body = (await readJson(res)) as Health;
    return res.ok && body?.v === 3 && body.status === "ok" ? body : null;
  } catch {
    return null;
  } finally {
    t.done();
  }
}

export interface OcrSuccess {
  ok: true;
  candidates: Candidate[];
  meta: OcrMeta;
}

function validCandidate(c: unknown): c is Candidate {
  const k = c as Candidate;
  return (
    !!k &&
    typeof k.id === "string" && /^c[1-9][0-9]?$/.test(k.id) &&
    FIELD_ORDER.includes(k.field as FieldName) &&
    typeof k.raw === "string" && k.raw.length >= 1 && k.raw.length <= 256 &&
    typeof k.value === "string" && k.value.length >= 1 && k.value.length <= 256 &&
    typeof k.label === "string" && k.label.length <= 128 &&
    Number.isInteger(k.confidenceBp) && k.confidenceBp >= 0 && k.confidenceBp <= 10000 &&
    Array.isArray(k.box) && k.box.length === 4 && k.box.every((n) => Number.isInteger(n) && n >= 0 && n <= 10000) &&
    k.box[0] < k.box[2] && k.box[1] < k.box[3]
  );
}

/** One consented JPEG, one intent key. Never retried automatically. */
export async function postOcr(jpeg: Blob, key: string, imageId: string, outer: AbortSignal): Promise<OcrSuccess | Failure> {
  const t = withTimeout(OCR_TIMEOUT_MS, outer);
  try {
    const res = await fetch("/api/v3/ocr", {
      method: "POST",
      headers: { "content-type": "image/jpeg", "idempotency-key": key, "x-image-id": imageId },
      body: jpeg,
      signal: t.signal,
      cache: "no-store",
    });
    let body: unknown;
    try {
      body = await readJson(res);
    } catch {
      return { ok: false, code: res.ok ? "PROTOCOL" : `HTTP_${res.status}` };
    }
    if (!res.ok) return { ok: false, code: errorCode(body, res.status) };
    const b = body as Record<string, unknown>;
    const cands = b.candidates as unknown[];
    const ids = new Set(Array.isArray(cands) ? cands.map((c) => (c as Candidate)?.id) : []);
    const valid =
      b.v === 3 &&
      b.imageId === imageId &&
      b.attemptId === key &&
      typeof b.requestId === "string" && UUID.test(b.requestId) &&
      (b.outcome === "candidates" || b.outcome === "no_fields") &&
      Array.isArray(cands) && cands.length <= 32 && ids.size === cands.length &&
      (b.outcome === "candidates" ? cands.length >= 1 : cands.length === 0) &&
      cands.every(validCandidate) &&
      Array.isArray(b.warnings) &&
      typeof b.timingsMs === "object" && b.timingsMs !== null;
    if (!valid) return { ok: false, code: "PROTOCOL" };
    const tm = b.timingsMs as OcrMeta["timingsMs"];
    return {
      ok: true,
      candidates: cands as Candidate[],
      meta: {
        requestId: b.requestId as string,
        region: String(b.region ?? ""),
        build: String(b.build ?? ""),
        timingsMs: { admission: Number(tm.admission) || 0, provider: Number(tm.provider) || 0, total: Number(tm.total) || 0 },
        usedToday: typeof b.usedToday === "number" ? b.usedToday : null,
        dailyCap: Number(b.dailyCap) || 0,
        warnings: (b.warnings as unknown[]).filter((w): w is string => typeof w === "string").slice(0, 6),
      },
    };
  } catch (e) {
    if (outer.aborted) return { ok: false, code: "LEFT" };
    return { ok: false, code: e instanceof DOMException && e.name === "AbortError" ? "TIMEOUT" : "NETWORK" };
  } finally {
    t.done();
  }
}

/** Optional AI wording (Bedrock). Sends only tier, family and rule IDs. Returns null on any problem. */
export async function postExplain(req: { lang: string; tier: string; family: string | null; ruleIds: string[] }): Promise<string | null> {
  const t = withTimeout(8_000);
  try {
    const res = await fetch("/api/v3/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: t.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await readJson(res)) as { v?: number; explanation?: unknown };
    return body?.v === 3 && typeof body.explanation === "string" && body.explanation.length <= 800 ? body.explanation : null;
  } catch {
    return null;
  } finally {
    t.done();
  }
}

/**
 * The person's own "what happened" text -> English for the complaint (Amazon Translate, Mumbai). Sent only after
 * an explicit tick; never retried automatically. The result is a proposal the person reviews and edits.
 */
export async function postTranslate(text: string): Promise<{ ok: true; text: string; sourceLang: string } | Failure> {
  const t = withTimeout(9_000);
  try {
    const res = await fetch("/api/v3/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: t.signal,
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await readJson(res);
    } catch {
      return { ok: false, code: res.ok ? "BAD_RESPONSE" : `HTTP_${res.status}` };
    }
    if (!res.ok) return { ok: false, code: errorCode(body, res.status) };
    const b = body as { v?: unknown; text?: unknown; sourceLang?: unknown };
    if (b?.v !== 3 || typeof b.text !== "string" || !b.text.trim() || b.text.length > 4000 || typeof b.sourceLang !== "string")
      return { ok: false, code: "BAD_RESPONSE" };
    return { ok: true, text: b.text.trim(), sourceLang: b.sourceLang };
  } catch {
    return { ok: false, code: t.signal.aborted ? "TIMEOUT" : "NETWORK" };
  } finally {
    t.done();
  }
}
