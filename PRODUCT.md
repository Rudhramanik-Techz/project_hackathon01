# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Indian families in the first minutes and hours after a UPI or impersonation scam: someone has just sent money, or is on a threatening call right now (for example a "digital arrest" or fake courier). Two people hold the phone equally often, and the product serves both:

- **The victim**, often an older or less tech-confident adult, frightened, possibly alone, possibly still on the call, reading in their own language on a small phone.
- **A family helper**, usually a younger relative, taking over or guiding the victim through the steps, with the victim beside them or on a call.

Their job: stop the money if they can (call 1930 inside the Golden Hour), then report it properly (cybercrime.gov.in / NCRP complaint, bank email) with the right numbers. Before money moves, they also need to check whether a message or call is a scam.

## Product Purpose

A free web app that turns panic into the next correct action. It puts 1930 first, then builds a 1930 call script, the cybercrime.gov.in complaint fields and a bank email from details the person confirms. It also checks a suspicious message and helps during a scary call.

Success means a stressed person, without help or with a helper, calls 1930 and files a complaint whose reference numbers are exactly right, and nothing about their case leaves the phone without their explicit consent.

## Positioning

- **Evidence beside the field.** OCR only proposes values, each shown next to the crop it came from. The person confirms or corrects it, and the same confirmed digits flow into the script, the NCRP cards and the bank email together (revision-bound pack: "Prepared in this browser · revision N").
- **Manual-first, works offline.** 1930 and "type the details" come before any upload. The checker, the manual pack and the scary-call screen work with no network. Only reading a screenshot needs one, and the app says so in plain words.
- **Private by construction.** The case lives only in the open tab's memory: no storage, no URL, no server. The checker runs on the phone.
- **Honest.** Elapsed time, never a countdown, and reporting never "expires". Provenance labels (synthetic/personal, live/manual) are shown. Accuracy is reported with its denominator and its misses.

## Operating Context

- Mostly phones, often mid-range Android, on unreliable networks. Installed as a PWA and cached after the first visit. 1930 and cybercrime.gov.in are visible before JavaScript loads.
- Used during or right after a phone call, under time pressure, sometimes passed between two people.
- Hands off to real external rituals: dialling 1930, filling the NCRP form on cybercrime.gov.in, emailing the bank. The output must match what those channels ask for (UPI reference vs bank reference, sender vs receiver VPA, amounts, leading zeros preserved).
- Sections: Services (I already paid, scary call, steps, scam checker, link check), Learn (guide, quiz, Saathi, family), Help (FAQ, privacy, disclaimer, accessibility, sitemap).

## Capabilities and Constraints

- Languages: English, Hindi, Bengali, Kannada, Malayalam, Marathi, Tamil, Telugu. Audio for English, Hindi and Tamil. Every string must fit all eight.
- In-browser rule-based scam checker (results: Likely scam / Suspicious / No known scam pattern found, which never means "safe").
- Optional screenshot reading (up to 3, consent ticked per image) via Amazon Textract in ap-south-1. Calls go through an exactly-once DynamoDB ledger with a kill switch and daily cap. When it is paused, the person is told to type the details.
- Optional "Translate to English" of the person's own story via Amazon Translate, ticked each time, then reviewed and edited.
- Bolo voice input uses the browser's speech recognition, with a disclosure that the vendor may process audio.
- Printable report pack. Demo cases with clearly labelled made-up data (seeds A and B).
- AI "simpler wording" exists but is off by default and only ever receives the tier, family and rule IDs, never the message.
- Stored on device: only the chosen language, text size and contrast.
- Hard constraints: no case data in storage, URLs, history state or server logs. Nothing is sent without an explicit, per-item consent.

## Brand Commitments

- Name: **Asli Ya Nakli?** ("Real or fake?"), also shown as असली या नकली.
- "Not a government service" must stay explicit. The app never implies it is 1930, NCRP, a bank or the police.
- Voice: plain, calm, direct words that someone in panic can act on. Tell people what to do next, never blame them, and never overclaim (for example, "No known scam pattern found" is never "safe").

## Evidence on Hand

- Synthetic sample receipts: `frontend/public/samples/seed_a.jpg`, `seed_b1.jpg`, `seed_b2.jpg`.
- Held-out checker evaluation and OCR eval: `eval/report.md` (also served at `frontend/public/eval-report.md`), `eval/holdout/`, `eval/ocr/`.
- Audio guidance: `frontend/public/audio/{en,hi,ta}`.
- **Absent, must not be fabricated:** user testimonials, user counts, money-recovered figures, official endorsements or partnerships with government or banks. A small first-time-user study was optional and may be cited only with real numbers.

## Product Principles

1. **1930 first, always.** No screen, step or loading state may stand between a person and calling 1930.
2. **The person confirms, the machine proposes.** Extracted or suggested values are never final until a human sees the source and confirms them.
3. **Works when everything else fails.** Offline, AWS down, OCR paused: the core path still completes, and every degraded state is explained in plain words.
4. **Nothing leaves without consent.** Privacy is a property of the architecture, stated plainly where the person makes the choice.
5. **Honest over impressive.** No countdowns, no "safe" verdicts, no invented proof. Show limits.

## Accessibility & Inclusion

- Target: **WCAG 2.2 AA** plus India's **GIGW** (Guidelines for Indian Government Websites), since the product sits next to government channels.
- Users include older adults, low-literacy and low-tech-confidence readers, and people under acute stress. Large targets, a simple step order and readable type in every script matter.
- Existing controls the product must keep: text size, high contrast, 8-language switcher, audio in 3 languages, voice input, and an accessibility page.
