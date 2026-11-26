// Case-model invariants (v3 §4/§6). Run: npm test  (esbuild bundle + node:test, no extra dependencies)
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Action, type CaseState, type Candidate, facts, newCase, reducer, validate } from "../src/case/model";
import { buildNcrpCards } from "../src/pack/ncrp";
import { build1930Script } from "../src/pack/script";

(globalThis as { URL: typeof URL }).URL.revokeObjectURL = () => {};

const cand = (id: string, field: Candidate["field"], value: string, top = 1000): Candidate => ({
  id, field, raw: value, value, label: "", confidenceBp: 9900, box: [1000, top, 5000, top + 400],
});

function run(c: CaseState, ...actions: Action[]): CaseState {
  return actions.reduce(reducer, c);
}

function withImage(c: CaseState, id: string): CaseState {
  return run(c, { type: "addImage", image: { id, name: id, url: "blob:x", blob: new Blob(), width: 720, height: 1280 } }, { type: "consent", imageId: id, value: true });
}

function read(c: CaseState, imageId: string, attemptId: string, cands: Candidate[]): CaseState {
  return run(
    c,
    { type: "sending", generation: c.generation, imageId, attemptId },
    { type: "ocrResult", generation: c.generation, imageId, attemptId, candidates: cands, meta: null, extraction: "live" },
  );
}

const A = [cand("c1", "upiRef", "012345678901"), cand("c2", "amountPaise", "100050", 2000), cand("c3", "upiRef", "812345678901", 3000)];

test("OCR only proposes: nothing reaches the pack until a person confirms", () => {
  let c = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  const tx = c.txs[0]!;
  assert.equal(tx.fields.upiRef.state, "proposed");
  assert.equal(facts(c).txs[0]!.upiRef, "");
  const rev = c.factsRev;
  c = run(c, { type: "accept", txId: tx.id, field: "upiRef" });
  assert.equal(facts(c).txs[0]!.upiRef, "012345678901"); // leading zero survives
  assert.equal(c.factsRev, rev + 1);
});

test("starting an edit withdraws the value at once; confirming a different value marks it corrected", () => {
  let c = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  const id = c.txs[0]!.id;
  c = run(c, { type: "accept", txId: id, field: "upiRef" }, { type: "edit", txId: id, field: "upiRef", text: "01234567890" });
  assert.equal(facts(c).txs[0]!.upiRef, "", "half-typed value must not be exported");
  c = run(c, { type: "confirmEdit", txId: id, field: "upiRef" });
  assert.equal(c.txs[0]!.fields.upiRef.state, "editing", "11 digits is rejected");
  c = run(c, { type: "edit", txId: id, field: "upiRef", text: "012345678907" }, { type: "confirmEdit", txId: id, field: "upiRef" });
  const f = c.txs[0]!.fields.upiRef;
  assert.ok(f.state === "confirmed" && f.method === "corrected" && f.source?.candidateId === "c1");
});

test("late or foreign results are ignored (generation, attempt, image)", () => {
  let c = withImage(newCase("personal", 0), "imgA");
  c = run(c, { type: "sending", generation: 0, imageId: "imgA", attemptId: "k1" });
  const stale = run(c, { type: "ocrResult", generation: 0, imageId: "imgA", attemptId: "OTHER", candidates: A, meta: null, extraction: "live" });
  assert.equal(stale.txs.length, 0);
  const reset = run(c, { type: "reset", origin: "personal" });
  const late = run(reset, { type: "ocrResult", generation: 0, imageId: "imgA", attemptId: "k1", candidates: A, meta: null, extraction: "live" });
  assert.equal(late.txs.length, 0);
  assert.equal(late.images.length, 0);
});

test("two images both returning c1: removing A clears only A-dependent facts; typed facts survive", () => {
  let c = withImage(withImage(newCase("personal", 0), "imgA"), "imgB");
  c = read(c, "imgA", "kA", [cand("c1", "upiRef", "111111111111")]);
  c = read(c, "imgB", "kB", [cand("c1", "upiRef", "222222222222")]);
  const [ta, tb] = c.txs;
  c = run(
    c,
    { type: "accept", txId: ta!.id, field: "upiRef" },
    { type: "accept", txId: tb!.id, field: "upiRef" },
    { type: "edit", txId: ta!.id, field: "bankName", text: "SBI" },
    { type: "confirmEdit", txId: ta!.id, field: "bankName" },
    { type: "removeImage", imageId: "imgA" },
  );
  assert.equal(c.txs[0]!.fields.upiRef.state, "empty");
  assert.equal(c.txs[0]!.fields.bankName.state, "confirmed");
  assert.equal(c.txs[1]!.fields.upiRef.state, "confirmed");
});

test("a candidate backs at most one field: proposing it elsewhere takes it away", () => {
  let c = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  c = run(c, { type: "addTx" });
  const [t1, t2] = c.txs;
  c = run(c, { type: "propose", txId: t2!.id, field: "upiRef", candidate: A[0]!, imageId: "imgA" });
  assert.equal(c.txs[0]!.fields.upiRef.state, "empty");
  assert.equal(c.txs.find((t) => t.id === t2!.id)!.fields.upiRef.state, "proposed");
  assert.ok(t1);
});

test("attestation records the revision; new facts make it stale, view changes do not", () => {
  let c = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  const id = c.txs[0]!.id;
  c = run(c, { type: "accept", txId: id, field: "upiRef" }, { type: "attest", key: "submittedPortal", on: true });
  assert.equal(c.attest.submittedPortal, c.factsRev);
  const same = run(c, { type: "consent", imageId: "imgA", value: false });
  assert.equal(same.factsRev, c.factsRev);
  c = run(c, { type: "accept", txId: id, field: "amountPaise" });
  assert.notEqual(c.attest.submittedPortal, c.factsRev);
});

test("re-reading an image withdraws facts that depended on its old reading", () => {
  let c = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  const id = c.txs[0]!.id;
  c = run(c, { type: "accept", txId: id, field: "upiRef" }, { type: "consent", imageId: "imgA", value: true });
  c = run(c, { type: "sending", generation: c.generation, imageId: "imgA", attemptId: "k2" });
  assert.equal(c.txs[0]!.fields.upiRef.state, "empty");
});

test("amount parsing is exact paise; no guessing", () => {
  assert.deepEqual(validate("amountPaise", "₹1,00,000.50"), { value: "10000050" });
  assert.deepEqual(validate("amountPaise", "48000"), { value: "4800000" });
  assert.deepEqual(validate("amountPaise", "१२३"), { value: "12300" });
  for (const bad of ["1,0,00", "12.345", "-5", "1e5", "0"]) assert.ok("error" in validate("amountPaise", bad), bad);
  assert.deepEqual(validate("occurredAt", "2026-11-25T11:19"), { value: "2026-11-25T11:19+05:30" });
});

test("pack: unconfirmed status is not called a completed loss; no total; leading zero kept", () => {
  let c = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  const id = c.txs[0]!.id;
  c = run(c, { type: "accept", txId: id, field: "upiRef" }, { type: "accept", txId: id, field: "amountPaise" });
  const script = build1930Script(facts(c), "en", []);
  assert.match(script, /0123 4567 8901/);
  assert.match(script, /not sure this payment went through/);
  assert.doesNotMatch(script, /total/i);
  const card = buildNcrpCards(facts(c), [], []).find((x) => x.title === "Transaction 1")!;
  assert.equal(card.fields.find((f) => f.label.startsWith("UTR"))!.value, "012345678901");
  assert.equal(card.fields.find((f) => f.label.startsWith("Amount"))!.value, "1000.50");
  assert.ok(!card.fields.some((f) => /not known/.test(f.value)), "no placeholders in portal fields");
});

test("zero confirmed fields still gives a usable general script", () => {
  const script = build1930Script(facts(newCase("personal", 0)), "hi", []);
  assert.match(script, /1930|शिकायत/);
});

test("loading a demo seed twice gives one clean synthetic case (StrictMode double effects)", () => {
  const seed = { clock: "2026-11-25T12:00+05:30", images: [{ id: "s1", name: "seed_a.jpg", url: "blob:s", blob: new Blob(), width: 720, height: 1280, candidates: A }] };
  let c = run(newCase("personal", 0), { type: "loadSeed", ...seed }, { type: "loadSeed", ...seed, images: [{ ...seed.images[0]!, id: "s2" }] });
  assert.equal(c.origin, "synthetic");
  assert.equal(c.images.length, 1);
  assert.equal(c.txs.length, 1);
  assert.equal(c.txs[0]!.fields.upiRef.state, "proposed");
  assert.equal(c.images[0]!.extraction, "precomputed");
});
