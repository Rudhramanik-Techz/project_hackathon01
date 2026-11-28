// Small pieces behind the portal screens: languages, digits, link check, unreadable messages and reminders.
import assert from "node:assert/strict";
import { test } from "node:test";
import { asciiDigits, newCase, facts, validate } from "../src/case/model";
import en from "../src/i18n/en.json";
import { LANGS, raw, translate } from "../src/i18n";
import { reminderIcs } from "../src/lib/ics";
import { inspectLink } from "../src/lib/link";
import { cannotCheck } from "../src/lib/readable";
import { templateExplanation } from "../src/lib/templates";
import { build1930Script } from "../src/pack/script";

const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

test("every language has every string, with the same placeholders", () => {
  for (const { code } of LANGS) {
    for (const [key, english] of Object.entries(en)) {
      const text = raw(code, key);
      assert.ok(text.trim(), `${code} ${key}`);
      assert.equal(holes(text), holes(english), `${code} ${key}`);
    }
  }
});

test("the call script is written in the chosen language, never silently in English", () => {
  const english = build1930Script(facts(newCase("personal", 0)), "en", []);
  for (const { code } of LANGS) {
    const script = build1930Script(facts(newCase("personal", 0)), code, ["9000000001"]);
    assert.ok(!/undefined|\{|\bsc\./.test(script), `${code}: ${script}`);
    if (code !== "en") assert.notEqual(script.split("\n")[0], english.split("\n")[0], code);
    assert.ok(translate(code, "call1930").includes("1930"), code);
  }
});

test("reviewed explanations exist only where written", () => {
  assert.ok(templateExplanation("likely_scam", "digital_arrest", ["x"], "hi"));
  assert.equal(templateExplanation("likely_scam", "digital_arrest", ["x"], "bn"), "");
});

test("digits typed in Indian scripts become ordinary digits", () => {
  for (const zero of [0x0966, 0x09e6, 0x0be6, 0x0c66, 0x0ce6, 0x0d66]) {
    const typed = String.fromCodePoint(zero, zero + 5, zero + 9);
    assert.equal(asciiDigits(typed), "059");
  }
  assert.ok("value" in validate("amountPaise", "৫০০"));
});

test("messages the rules cannot read are recognised", () => {
  for (const m of ["আপনার পার্সেল", "మీ పార్సెల్", "ನಿಮ್ಮ ಪಾರ್ಸೆಲ್", "നിങ്ങളുടെ പാഴ്സൽ", "तुमचे पार्सल अडकले आहे"]) assert.equal(cannotCheck(m), true, m);
  for (const m of ["Your parcel is held", "आपका पार्सल रोका गया है", "உங்கள் பார்சல்"]) assert.equal(cannotCheck(m), false, m);
});

test("short Marathi messages are recognised; common Hindi scam wording is not mistaken for Marathi", () => {
  for (const m of [
    "पार्सल अडकले. पैसे पाठवा.",
    "माझा मोबाईल हरवला, या नंबरवर पैसे पाठव",
    "वीज बिल भरले नाही तर वीजपुरवठा खंडित होईल",
    "आपले खाते बंद होणार आहे",
    "मी सीबीआय मधून बोलत आहे. व्हिडिओ कॉलवर राहा, कोणालाही सांगू नका.",
  ]) assert.equal(cannotCheck(m), true, m);
  for (const m of [
    "आपकी बिजली आज रात काट दी जाएगी",
    "आज रात्रि 9 बजे बिजली कटेगी",
    "पापा मेरा एक्सीडेंट हो गया है, जल्दी पैसे भेजो",
    "आपका खाता बंद हो जाएगा, तुरंत KYC करें",
    "मुझे अभी पैसे चाहिए, किसी को मत बताना",
    "सावधान! पुलिस कभी वीडियो कॉल पर गिरफ्तार नहीं करती।",
  ]) assert.equal(cannotCheck(m), false, m);
});

test("link check reads only the address text", () => {
  assert.equal(inspectLink("hello there"), null);
  assert.equal(inspectLink("javascript://x.com"), null);
  assert.deepEqual(inspectLink("https://cybercrime.gov.in/")!.flags, []);
  assert.ok(inspectLink("http://192.168.0.1/a.apk")!.flags.includes("lkApk"));
  assert.ok(inspectLink("https://sbi.co.in@evil.example.com")!.flags.includes("lkAt"));
  assert.equal(inspectLink("https://gov.in.pay.example.com")!.gov, false);
  for (const flag of inspectLink("http://bit.ly/x")!.flags) assert.ok(flag in en, flag);
});

test("calendar reminder escapes text and folds long lines", () => {
  const ics = reminderIcs(new Date("2026-12-01T04:30:00Z"), "a,b;c\\d", "പ".repeat(80), new Date("2026-11-27T00:00:00Z"));
  assert.ok(ics.includes(String.raw`SUMMARY:a\,b\;c\\d`));
  assert.ok(ics.includes("DTSTART:20261201T043000Z"));
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});
