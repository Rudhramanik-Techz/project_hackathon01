# Asli Ya Nakli? — Architecture v3-lite (what we build for Nov 30)

Source documents: the 16-page AWS PDF (v1), `BUILD_PROMPT.md`, and `MASTER_CONTROL_SPEC.md` (v3.0 "Gold-Master",
103 audit findings). This file decides what we take from v3, what we simplify, and what we skip, for one solo
builder with a deadline of **Nov 30, 6 PM IST** and Phase 7 deploy on **Nov 28**.

## 1. Verdict on the v3 spec

v3 is right about the product and over-built for a 5-day solo hackathon. Its best ideas are cheap to build and
are exactly what makes judges stop scrolling. Its most expensive parts (formal models, JSON-Schema fixtures for
13 error codes, per-raster consent revisions, build-digest service-worker validation, a 5-person study) add
weeks, not demo value.

| v3 idea | Wow value | Cost | Decision |
|---|---|---|---|
| **Evidence beside the field**: crop of the receipt next to each extracted value; the user confirms or corrects; the same digits flow to script, NCRP card and bank email | Highest. Judges see OCR + human-in-the-loop + data integrity in 10 seconds | Medium | **Adopt** |
| **Manual-first**: 1930 and "type the details" before any upload; works with AWS down or offline | High. Survives hall Wi-Fi; strong "designed for a panicking family" story | Low | **Adopt** |
| **Exactly-once paid OCR**: one DynamoDB transaction (kill switch + request tombstone + daily cap + per-second bucket) before Textract is called once, no retries | High with technical judges; "AWS-native engineering", visible in the evidence drawer | Medium | **Adopt** |
| **Checker runs in the browser**: rules ship as JSON, the message never leaves the phone | High. Privacy story is concrete, and it works offline | Medium (port ~150 lines to TS) | **Adopt**, Python engine stays as the eval reference with a parity test |
| **Revision-bound pack**: "Prepared in this browser · revision 3"; "Details changed since you marked this reported" | Medium-high. Shows rigour | Low | **Adopt** |
| **Elapsed time, not a countdown**: per confirmed payment; reporting never "expires" | Medium. Removes a misleading claim | Low | **Adopt** |
| **Honest provenance labels**: synthetic/personal × live/manual/precomputed; AWS timings only on a live run | Medium. Judges trust everything else more | Low | **Adopt** |
| Separate UPI ref vs bank ref, integer paise, sender vs receiver VPA, direction + status, leading zeros preserved | Medium (seed A shows `012345678901` surviving) | Low-medium | **Adopt** |
| One binary JPEG per request, sequential with 1.1 s pacing | Low (invisible) but fixes base64/6 MB and Textract TPS issues | Low | **Adopt** |
| Remove public `/api/trace/{id}` and the message cache | Invisible; removes two security findings | Negative (less code) | **Adopt** |
| Full field state machine (4-part SourceRef, edit buffers with predecessors, candidate reassignment, consent per raster revision) | Low over the simplified version | High | **Simplify**: field = `{state, value, source?}`; source = `{imageId, candidateId}`; removing an image clears fields that depend on it |
| Strict JSON-Schema contracts for all statuses, duplicate-member JSON parsing, 32 KiB stream bound | Low | Medium | **Simplify**: Pydantic out, TypeScript guard in, 32 KiB response cap |
| Build-digest service-worker validation | Low | High | **Skip**: vite-plugin-pwa already precaches a revisioned manifest |
| Bounded model checking (1,716 states) | Low for this audience | High | **Skip**: replaced by a concurrency test against moto/memory ledger |
| Five-volunteer first-time-user study | **High** if real ("4 of 5 friends fixed the wrong digit in under 90 s") | 1 evening with friends | **Optional**, Nov 29, only real numbers |
| No runtime Bedrock at all | — | — | **Your call** (section 6) |

## 2. The three "wow" moments the architecture is built around

1. **"Fix one digit, everything updates."** Upload a synthetic receipt live. The UPI reference shows its crop
   from the screenshot beside the field. Correct one digit, tap Confirm, and the 1930 script, the NCRP card
   and the bank email all change together, with the pack revision going from 2 to 3.
2. **"Pull the plug."** Turn on airplane mode. The scam checker still works (it runs in the phone), the
   manual pack still works, the scary-call screen still works. Only "Read screenshot" says it needs the
   network, and it says so in plain words.
3. **"It can't double-spend."** Tap Read five times. One Textract call happens. The evidence drawer shows
   `ap-south-1 · admission 18 ms · Textract 640 ms · today 7/150`. Flip `POLICY#OCR` off in DynamoDB and the
   next upload gets "Reading screenshots is paused; type the details" while everything else keeps working.

Honesty closes the pitch: held-out accuracy with its denominator and two real misses.

## 3. System

```
Phone browser (React/Vite PWA, cached after first visit)
 ├─ index.html: 1930 + cybercrime.gov.in visible before JavaScript loads
 ├─ Checker: rules.json + TS engine, in the browser (no network, message never leaves the phone)
 ├─ Case (memory only): transactions, fields with source crops, evidence, attestations, facts revision
 ├─ Pack = f(confirmed facts at revision N): 1930 script · NCRP cards · bank email
 └─ optional OCR: one JPEG per request, sequential, user consent per image
        │  POST /api/v3/ocr   (image/jpeg body, Idempotency-Key, X-Image-ID)
        ▼
CloudFront ── /* ──► S3 (private, OAC): site, audio, samples, eval report
     └──── /api/v3/* ──► API Gateway HTTP API (throttle 2 rps, burst 3)
                              ├─ GET  /api/v3/health ─► health Lambda (no table, no AI)
                              └─ POST /api/v3/ocr    ─► ocr Lambda (Python 3.12, arm64, 10 s)
                                     1. validate JPEG (bytes, dimensions)
                                     2. DynamoDB TransactWriteItems (one attempt, fresh private token):
                                          ConditionCheck POLICY#OCR enabled
                                          Put    REQ#<key>  if absent          (dedupe)
                                          Update DAY#<UTC>  if used < 150      (daily cap)
                                          Put    SEC#<sec>  if absent          (1 per second)
                                     3. only on success: Textract DetectDocumentText once, 4.5 s deadline
                                     4. candidates + boxes + warnings + timings ──► browser
DynamoDB asli-ledger (pk only, TTL expiresAt): POLICY / REQ / DAY / SEC rows. No user data, no case data.
```

Removed from the current build: `POST /api/check` (checker moves to the browser), `POST /api/golden-hour`
(replaced by `/api/v3/ocr`), `GET /api/trace/{id}` (timings come back in the OCR response), the 7-day check
cache, and the `asli-main` pk/sk table (replaced by the pk-only ledger; nothing is deployed yet, so no migration).

## 4. Contracts

**POST /api/v3/ocr.** Body: raw JPEG, 1–1,200,000 bytes, long edge ≤ 1,600 px. Headers: `Content-Type:
image/jpeg`, `Idempotency-Key` and `X-Image-ID` as lowercase UUIDv4, one value each.

200:
```json
{"v":3,"requestId":"…","imageId":"…","attemptId":"<idempotency key>","outcome":"candidates",
 "candidates":[{"id":"c1","field":"upiRef","raw":"012345678901","label":"UPI Ref","confidenceBp":9810,
   "box":[1900,5200,5700,5700]}],
 "warnings":["multiple_amounts"],"timingsMs":{"admission":20,"provider":610,"total":720},
 "region":"ap-south-1","usedToday":7,"dailyCap":150}
```
`field` ∈ amountPaise, upiRef, bankRef, senderVpa, receiverVpa, bankName, occurredAt, direction, paymentStatus.
`box` = [left, top, right, bottom] in basis points of the uploaded image. `outcome:"no_fields"` has no candidates.

Errors: `{"v":3,"error":{"code":"…","requestId":"…"}}` with 400 INVALID_REQUEST, 409 ALREADY_ATTEMPTED,
413 IMAGE_TOO_LARGE, 415 UNSUPPORTED_MEDIA, 422 INVALID_IMAGE, 429 RATE_LIMITED (Retry-After: 1),
503 PAUSED | DAILY_LIMIT | TEMPORARILY_UNAVAILABLE, 504 OCR_DEADLINE, 500 INTERNAL.
Precedence when several conditions fail: paused → duplicate → daily → per-second. Unknown commit outcome → 503
and **no** Textract call. No automatic retry anywhere (browser, SDK or Lambda). Every response `no-store`.

**GET /api/v3/health** → `{"v":3,"build":"…","status":"ok","region":"ap-south-1"}`.

## 5. Browser case model (simplified v3)

```ts
type Field<T> =
  | { state: "empty" } | { state: "unknown" }
  | { state: "proposed"; value: T; source: Source }          // from OCR, not yet trusted
  | { state: "confirmed"; value: T; source: Source | null };  // source null = typed by user
type Source = { imageId: string; candidateId: string; box: Box };
Transaction = { id, imageIds[], amountPaise, upiRef, bankRef, senderVpa, receiverVpa, bankName,
                occurredAt, direction, paymentStatus }      // each a Field
Case = { id, origin: "personal"|"synthetic", extraction per image: "live"|"manual"|"precomputed",
         factsRev, transactions ≤12, images ≤3, evidence ≤12, ack, attested: {called, portal, bank}: rev|null }
```

Rules: only `confirmed` fields reach the pack. Editing a confirmed field turns it back to unconfirmed until the
user confirms again. Removing an image clears fields whose source is that image (typed fields survive).
`factsRev` goes up only when confirmed content changes, never for language, zoom or drawer toggles. An
attestation stores the revision it was made at; if `factsRev` moves on, the pack shows "Details changed since
you marked this reported". "Completed loss" wording only when direction = outgoing and status = completed;
otherwise "reported amount". No automatic loss total. Results arriving for a reset case or a replaced image
are dropped (generation check). Nothing is persisted: no sessionStorage autosave in v3.

## 6. Open decision: Bedrock

v3 removes runtime Bedrock: advice comes only from reviewed templates, and no personal text reaches a model.
That is the safest design and needs no quota. But this is an AWS hackathon and the rubric may reward
generative AI. Options:

- **A. Drop Bedrock** (v3 as written). Simplest; nothing to unblock.
- **B. Keep Bedrock optional and privacy-safe.** The browser can ask `/api/v3/explain` for a friendlier
  explanation, sending **only** tier, family and matched rule IDs plus language, never the message. Off by
  default (`LLM_PROVIDER=mock`), switched on when your quota is approved. One more small Lambda.
- **C. Keep the current server-side checker with Bedrock** and the message sent to it. Contradicts v3's
  "the message never leaves your phone" and the strongest privacy wow.

**Decided (Nov 25): B.** `POST /api/v3/explain` takes `{lang, tier, family, ruleIds[]}` (rule IDs are checked
against the shipped rules; no free text is accepted), has its own daily cap row in the ledger table, and returns
503 when the model is off or capped. The browser always shows the template first and swaps in the model text
only if it arrives, labelled "written by AI from the reasons above".

## 7. Build plan

| When | Done when |
|---|---|
| Wed Nov 25 night | Ledger + `/api/v3/ocr` + `/api/v3/health` with memory and DynamoDB stores; candidate parser with boxes; tests incl. five-taps and last-slot race |
| Thu Nov 26 | TS checker engine + parity test against Python; manual-first paid flow; field review with source crops; pack from confirmed facts with revision + attestations; elapsed time |
| Fri Nov 27 | Sequential upload with consent preview; evidence drawer with provenance; seeds A/B/C; samples rebuilt; offline check; i18n for new strings |
| Sat Nov 28 | Template v3 (pk-only ledger, OCR + health only), deploy, smoke, live synthetic upload on phone, tag v1.0 |
| Sun Nov 29 | Held-out eval run, README + Idea Brief + Build Summary, demo video; optional 5-friend task test |
| Mon Nov 30 | Buffer; submit by 6 PM IST |

Cut order if late: attestation history → seed B → Saathi audio (keep transcript) → bank email.
Never cut: manual-first flow, field crops + confirm, the ledger, the held-out eval, the deploy.
