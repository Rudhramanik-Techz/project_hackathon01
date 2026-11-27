// Case-model invariants (v3 §4/§6). Run: npm test  (esbuild bundle + node:test, no extra dependencies)
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Action, type CaseState, type Candidate, facts, type FieldName, hasDraft, newCase, reducer, validate } from "../src/case/model";
import { redact } from "../src/lib/checker";
import { buildBankEmail } from "../src/pack/email";
import { buildDescription, buildNcrpCards } from "../src/pack/ncrp";
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

test("a re-read keeps confirmed facts unless it actually returns a new reading", () => {
  let c = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  const id = c.txs[0]!.id;
  c = run(c, { type: "accept", txId: id, field: "upiRef" }, { type: "consent", imageId: "imgA", value: true });
  const sending = run(c, { type: "sending", generation: c.generation, imageId: "imgA", attemptId: "k2" });
  assert.equal(facts(sending).txs[0]!.upiRef, "012345678901", "tapping read again changes nothing yet");
  const owner = { generation: c.generation, imageId: "imgA", attemptId: "k2" };
  const failed = run(sending, { type: "ocrFailed", ...owner, code: "NETWORK" });
  const left = run(sending, { type: "revokePending" });
  const empty = run(sending, { type: "ocrResult", ...owner, candidates: [], meta: null, extraction: "live" });
  for (const s of [failed, left, empty]) {
    assert.equal(facts(s).txs[0]!.upiRef, "012345678901");
    assert.equal(s.images[0]!.candidates.length, A.length);
  }
  // An empty re-read must not say "no payment details found" while the earlier reading is still shown.
  assert.equal(empty.images[0]!.state, "reviewable");
  assert.equal(empty.images[0]!.error, "EMPTY_REREAD");
  const firstEmpty = read(withImage(newCase("personal", 0), "imgB"), "imgB", "k1", []);
  assert.equal(firstEmpty.images[0]!.state, "no-fields");
  // The surviving pool can still be used, and still says which attempt produced it.
  const reused = run(failed, { type: "propose", txId: id, field: "upiRef", candidate: A[2]!, imageId: "imgA" });
  const f = reused.txs[0]!.fields.upiRef;
  assert.ok(f.state === "proposed" && f.source.attemptId === "k1");
});

test("a new reading replaces the pool: facts from the old one are withdrawn, typed facts survive", () => {
  let c = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  const id = c.txs[0]!.id;
  c = run(c, { type: "accept", txId: id, field: "upiRef" }, { type: "edit", txId: id, field: "bankName", text: "SBI" },
    { type: "confirmEdit", txId: id, field: "bankName" }, { type: "consent", imageId: "imgA", value: true });
  c = read(c, "imgA", "k2", [cand("c1", "upiRef", "999999999999")]);
  assert.equal(c.txs.length, 1);
  assert.equal(facts(c).txs[0]!.upiRef, "");
  assert.equal(facts(c).txs[0]!.bankName, "SBI");
  const f = c.txs[0]!.fields.upiRef;
  assert.ok(f.state === "proposed" && f.value === "999999999999" && f.source.attemptId === "k2");
});

test("only a real case with something in it needs confirmation before a demo replaces it", () => {
  const fresh = newCase("personal", 0);
  assert.equal(hasDraft(fresh), false);
  assert.equal(hasDraft(run(fresh, { type: "addTx" })), false);
  assert.equal(hasDraft(run(fresh, { type: "info", key: "name", value: "A" })), true);
  assert.equal(hasDraft(withImage(fresh, "imgA")), true);
  const id = run(fresh, { type: "addTx" });
  assert.equal(hasDraft(run(id, { type: "edit", txId: id.txs[0]!.id, field: "bankName", text: "SBI" })), true);
  assert.equal(hasDraft(run(fresh, { type: "reset", origin: "synthetic" }, { type: "info", key: "name", value: "A" })), false);
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

function typed(values: Partial<Record<FieldName, string>>): CaseState {
  let c = run(newCase("personal", 0), { type: "addTx" });
  const txId = c.txs[0]!.id;
  for (const [field, text] of Object.entries(values) as [FieldName, string][])
    c = run(c, { type: "edit", txId, field, text }, { type: "confirmEdit", txId, field });
  return c;
}

test("script leaves unconfirmed details unsaid, in every language", () => {
  const f = facts(typed({ amountPaise: "500" }));
  for (const [lang, placeholder] of [["en", /not known|UPI ID|account/], ["hi", /पता नहीं|UPI ID|खाते/], ["ta", /குறிப்பு எண்|UPI ID|கணக்கி/]] as const) {
    const script = build1930Script(f, lang, []);
    assert.match(script, /500/);
    assert.doesNotMatch(script, placeholder, lang);
  }
});

test("money received is never described as sent, nor its receiving ID as the suspect's", () => {
  const f = facts(typed({ amountPaise: "500", receiverVpa: "me@okbank", direction: "incoming", paymentStatus: "completed" }));
  const script = build1930Script(f, "en", []);
  assert.match(script, /Received at UPI ID me@okbank/);
  assert.doesNotMatch(script, /Sent to|not sure/);
  assert.doesNotMatch(buildDescription(f, [], []), / to me@okbank|held/);
  const cards = buildNcrpCards(f, [], []);
  assert.ok(!cards.flatMap((x) => x.fields).some((x) => /Suspect/.test(x.label) && x.value.includes("me@okbank")));
  assert.doesNotMatch(buildBankEmail(f).body, / to UPI ID|hold the amount/);
});

test("an empty case claims no loss and asks for no freeze; a confirmed payment asks for a hold", () => {
  const empty = facts(newCase("personal", 0));
  const description = buildDescription(empty, [], []);
  assert.match(description, /suspected/);
  assert.doesNotMatch(description, /was defrauded|held|frozen/);
  assert.doesNotMatch(buildBankEmail(empty).body, /hold the amount/);
  const paid = facts(typed({ receiverVpa: "x@okbank", direction: "outgoing", paymentStatus: "completed" }));
  assert.match(buildDescription(paid, [], []), /amount held/);
  assert.match(buildBankEmail(paid).body, /hold the amount/);
});

test("redaction hides digits written in Indian scripts too", () => {
  for (const text of ["OTP 482913", "ओटीपी ४८२९१३", "ஓடிபி ௪௮௨௯௧௩", "card 4111 1111 1111 1111"])
    assert.doesNotMatch(redact(text), /\p{Nd}/u, text);
  assert.equal(redact("at 9 pm pay 50"), "at 9 pm pay 50");
});

test("removing or replacing a screenshot withdraws corrected values; independently typed ones survive", () => {
  let base = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  const id = base.txs[0]!.id;
  base = run(base,
    { type: "edit", txId: id, field: "upiRef", text: "222222222222" }, { type: "confirmEdit", txId: id, field: "upiRef" }, // corrected
    { type: "edit", txId: id, field: "amountPaise", text: "75" }, // mid-edit of a reading
    { type: "edit", txId: id, field: "bankName", text: "SBI" }, { type: "confirmEdit", txId: id, field: "bankName" }, // typed
    { type: "consent", imageId: "imgA", value: true });
  const corrected = base.txs[0]!.fields.upiRef;
  assert.ok(corrected.state === "confirmed" && corrected.method === "corrected");
  const removed = run(base, { type: "removeImage", imageId: "imgA" });
  const replaced = read(base, "imgA", "k2", [cand("n1", "senderVpa", "a@okbank")]);
  for (const s of [removed, replaced]) {
    const f = s.txs[0]!.fields;
    assert.equal(f.upiRef.state, "empty");
    assert.equal(f.amountPaise.state, "empty");
    assert.equal(facts(s).txs[0]!.bankName, "SBI");
  }
});

test("a payment whose direction is not confirmed is never listed as the suspect's nor held", () => {
  const f = facts(typed({ receiverVpa: "me@okbank" }));
  const cards = buildNcrpCards(f, [], []);
  assert.ok(!cards.flatMap((x) => x.fields).some((x) => /^Suspect/.test(x.label) && x.value.includes("me@okbank")));
  assert.doesNotMatch(buildDescription(f, [], []), /held/);
  assert.doesNotMatch(buildBankEmail(f).body, /hold the amount/);
});

test("the script does not count a payment row with nothing in it", () => {
  const f = facts(run(newCase("personal", 0), { type: "addTx" }));
  assert.doesNotMatch(build1930Script(f, "en", []), /1 payment|Payment 1/);
});

test("a payment confirmed as failed or reversed is said so, not 'not sure it went through'", () => {
  for (const status of ["failed", "reversed", "pending"] as const) {
    const f = facts(typed({ amountPaise: "500", upiRef: "012345678901", direction: "outgoing", paymentStatus: status }));
    for (const lang of ["en", "hi", "ta", "bn", "mr", "te", "kn", "ml"] as const) {
      const script = build1930Script(f, lang, []);
      assert.doesNotMatch(script, /not sure|पक्का नहीं|உறுதியாகத்|নিশ্চিত নই|खात्री नाही|ఖచ్చితంగా తెలియదు|ಖಚಿತವಿಲ್ಲ|ഉറപ്പില്ല/, `${lang} ${status}`);
    }
    assert.match(build1930Script(f, "en", []), new RegExp(`shows this payment as ${status}`));
    assert.match(buildDescription(f, [], []), new RegExp(`payment shown as ${status}`));
    assert.doesNotMatch(buildDescription(f, [], []), /status not confirmed/);
    assert.match(buildBankEmail(f).body, new RegExp(`payment shown as ${status}`));
  }
  // An unconfirmed status still says so.
  const unknown = facts(typed({ amountPaise: "500", direction: "outgoing" }));
  assert.match(build1930Script(unknown, "en", []), /not sure this payment went through/);
  assert.match(buildDescription(unknown, [], []), /status not confirmed/);
});

test("message excerpts: bounded list, no duplicates, never cut, and part of the report revision", () => {
  let c = newCase("personal", 0);
  const rev = c.factsRev;
  c = run(c, { type: "addExcerpt", text: "  Your parcel is held, pay ₹••••  " });
  assert.deepEqual(c.excerpts, ["Your parcel is held, pay ₹••••"]);
  assert.equal(c.factsRev, rev + 1);
  assert.equal(hasDraft(c), true);
  assert.equal(run(c, { type: "addExcerpt", text: "Your parcel is held, pay ₹••••" }).excerpts.length, 1);
  assert.equal(run(c, { type: "addExcerpt", text: "x".repeat(2001) }).excerpts.length, 1, "over-long is refused, not cut");
  for (let i = 0; i < 20; i++) c = run(c, { type: "addExcerpt", text: `part ${i}` });
  assert.equal(c.excerpts.length, 12);
  assert.equal(c.excerpts[11], "part 10");
  c = run(c, { type: "removeExcerpt", index: 0 });
  assert.equal(c.excerpts[0], "part 0");
  assert.match(buildDescription(facts(c), [], []), /"part 0"/);
});

test("a screenshot can be linked to another payment, and moving a reading withdraws it from the first", () => {
  let c = read(withImage(newCase("personal", 0), "imgA"), "imgA", "k1", A);
  const first = c.txs[0]!.id;
  c = run(c, { type: "accept", txId: first, field: "upiRef" }, { type: "addTx" });
  const second = c.txs[1]!.id;
  c = run(c, { type: "linkImage", txId: second, imageId: "imgA" });
  assert.deepEqual(c.txs[1]!.imageIds, ["imgA"]);
  assert.equal(run(c, { type: "linkImage", txId: second, imageId: "nope" }), c, "unknown image is ignored");
  c = run(c, { type: "propose", txId: second, field: "upiRef", candidate: A[0]!, imageId: "imgA" });
  assert.equal(c.txs[0]!.fields.upiRef.state, "empty", "the reading left Payment 1");
  assert.equal(c.txs[1]!.fields.upiRef.state, "proposed");
  assert.equal(facts(c).txs.find((x) => x.id === first)!.upiRef, "");
});

test("printable pack: confirmed facts only, unknowns as a dash, status said plainly, demo-labelled file name", async () => {
  const { buildSheet, DASH, sheetTitle } = await import("../src/pack/sheet");
  const f = facts(typed({ amountPaise: "1,000.50", upiRef: "012345678901", direction: "outgoing", paymentStatus: "failed" }));
  const s = buildSheet(f, ["9876543210"], []);
  assert.equal(s.rows.length, 1);
  const r = s.rows[0]!;
  assert.match(r.amount, /1,000\.50/);
  assert.equal(r.ref, "UTR 012345678901", "leading zero kept");
  assert.equal(r.to, DASH);
  assert.equal(r.when, DASH);
  assert.equal(r.status, "Sent, failed");
  assert.match(s.description, /012345678901/);
  assert.equal(buildSheet(facts(newCase("personal", 0)), [], []).rows.length, 0);
  assert.equal(sheetTitle(3, false), "Asli-Ya-Nakli-report-rev-3");
  assert.equal(sheetTitle(3, true), "DEMO-Asli-Ya-Nakli-report-rev-3");
  assert.equal(facts(typed({ amountPaise: "5" })).txs.length, 1);
  assert.equal(buildSheet(facts(typed({ amountPaise: "5" })), [], []).rows[0]!.status, "Not confirmed");
});

test("an English version of the story, when present, is what the English complaint text uses", () => {
  let c = run(newCase("personal", 0), { type: "info", key: "story", value: "मेरे साथ धोखा हुआ" });
  assert.match(buildDescription(facts(c), [], []), /मेरे साथ धोखा हुआ/);
  const rev = c.factsRev;
  c = run(c, { type: "info", key: "storyEn", value: "I was cheated." });
  assert.equal(c.factsRev, rev + 1, "the English version is part of the report");
  const d = buildDescription(facts(c), [], []);
  assert.match(d, /I was cheated\./);
  assert.doesNotMatch(d, /धोखा/);
  c = run(c, { type: "info", key: "storyEn", value: "" });
  assert.match(buildDescription(facts(c), [], []), /मेरे साथ धोखा हुआ/, "removing it falls back to the story");
});
