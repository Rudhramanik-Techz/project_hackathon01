# Asli Ya Nakli: what is left before production

Written 27 Nov 2026 for branch `sujith-updates`; P0 code fixes updated later on 27 Nov. **Current state: working prototype, not production ready.**

Round 1 deadline: **30 Nov 2026, 11:59 PM IST**, with student verification recommended by **27 Nov** (from the 26 Nov reading of the Techfest rules; confirm on the official site).

## Start here

```powershell
git fetch origin
git switch sujith-updates
git pull
cd frontend
npm ci
npm test
npm run build
npm run dev
```

- `npm run dev` serves the frontend only. For live API calls, also run `scripts/local_api.py` (or use `scripts/dev.sh`).
- For Python tests, install `backend/requirements-dev.txt` in a virtualenv and run `python -m pytest` from the repo root.

## Where things stand

| Check | State |
|---|---|
| TypeScript check | Passed |
| Frontend tests | 29 passed |
| Python tests | 223 passed (all files, including `test_llm.py`, `test_ledger.py` and TS/Python parity) |
| Browser tests (desktop, phone, tablet sizes) | Passed with a mocked server, bundled with esbuild |
| `vite build`, `npm run dev` | Both work locally (27 Nov). Main bundle is 806 KB raw / 224 KB gzip |
| Real phones, deployed AWS | **Not tested** |
| Live URL | Still runs the old version |

## P0: before any demo

- [x] `npm run build` and `npm run dev` work locally.
- [ ] After pushing, the GitHub Actions run is green.
- [ ] Click through every page on a laptop and a real phone.
- [x] **Hindi false alarm.** The named Hindi and English advisories score 0. Also fixed: "Beware of digital arrest scams.", "Digital arrest is a fraud.", "No government agency asks you to transfer money…" and Tamil "போலீஸ் … கைது செய்ய மாட்டார்கள்." without ஒருபோதும். Both engines changed; cases added to `tests/parity_cases.json` and `tests/test_rules.py`, including threats that must stay flagged.
  - Still flagged on purpose, because the threat-word guard keeps the sentence: "Real police will never ask you to stay on a video call" (65), Hindi advisories containing "ट्रांसफर" (35), "Electricity board never sends SMS asking you to call an officer…" (60). Collect real advisories before loosening that guard.
- [x] **Empty re-read.** An empty re-read keeps the image reviewable and says "This read found nothing new. The earlier reading is kept below." (new key `img_reread_empty` in all 8 languages; non-English wording needs native review).
- [x] **Failed payments.** A confirmed failed, reversed or pending status is now said plainly in the call script (all 8 languages), the NCRP text and the bank draft ("payment shown as failed"). Only an unconfirmed status says "not sure". New `sc.failed/reversed/pending` keys need native review.
- [x] **Marathi detection** widened to about 45 Marathi-only words (verb endings, pronouns, postpositions). Catches 10 of 10 sample scams and has 0 false positives over 455 Hindi strings (all of `hi.json`, the Hindi test cases and sample scams). Still a word list: re-test with real Marathi messages.

### Also fixed from the 26 Nov audit PDF
- Already fixed before 27 Nov (checked in code and tests): demo sample asks before replacing a real case; a failed re-read keeps confirmed fields; empty case says "suspected" and asks for no hold; incoming payments are not "Sent to"; unknown details are left unsaid; Hindi and Tamil digits are hidden.
- [x] Safe app updates: the service worker now uses `registerType: "prompt"`, so a new version waits until every tab is closed instead of replacing the app under an open case. There is no "update available" prompt yet.
- [x] Rollback safety: `deploy.sh` no longer uses `s3 sync --delete`, so the previous build's hashed files stay in the bucket.
- [x] Spec gaps closed on 27 Nov (no new AWS permissions needed): HEAD on static routes; OCR handler 7 s budget (no admission or dispatch without time for the provider) and cross-site browser origin check (`ALLOWED_ORIGINS` for extra origins); excerpt selection before a message enters the report, kept as a list of up to 12; linking a screenshot to another payment and moving a reading with confirmation; previous/next unchecked detail; crop zoom; app updates applied when no case is open. The browser calls the Bedrock explain route only in a build with `VITE_EXPLAIN=on`.
- Still open because they need AWS approval, an email address or other people: CloudFront, Bedrock, budget alerts, Tamil audio, rule sources, evaluation sets, user study, real-device tests. Visitors who opened the 26 Nov version see the new one after closing all its tabs once.
- [x] Optional "Translate to English" for the story (Amazon Translate, `POST /api/v3/translate`, consent per request, daily cap `TranslateDailyCap`=300, nothing stored or logged). Tested with real Translate locally. Machine translation can reverse meaning (one test turned "made me send" into "sent me"), so the person must review the English; the screen says so.
- Note: a **successful** re-read still withdraws fields confirmed from the earlier reading. That is deliberate (spec §4, R3-A02; tested in `model.test.ts`).

## P1: before submitting

### Deployment
- [ ] Decide which AWS account to use. Deploying the same stack name in the same account overwrites the live app.
- [ ] Deploy with `scripts/deploy.sh`, passing `AlarmEmail=...`. Confirm the alarm email subscription.
- [ ] Screenshot reading starts paused: `python scripts/ocr_switch.py on`, then `bash scripts/smoke.sh <url>`.
- [ ] Add **$5 and $15 AWS budget alerts** (in the spec, not in `template.yaml`).
- [ ] CloudFront + private S3 is the spec design; the default is the interim API Gateway site. Switch with `UseCloudFront=true` once the account allows it.
- [ ] Check the daily caps (`OcrDailyCap`, `LlmDailyCap`) before sharing the URL.

### Live checks
- [ ] One synthetic receipt through the deployed Textract path.
- [ ] Offline: open once, disconnect, reopen, complete the manual flow. Also test a first visit while offline and an app update during an open case.
- [ ] Install to a phone home screen; check the new icon.
- [ ] Throttling returns 429 on the raw API URL.
- [ ] Update `docs/CHAOS.md` where it no longer matches the app (for example, case details are no longer restored after refresh), then run it.

### Evidence and content
- [ ] **Rule sources:** replace the 33 `TODO_SOURCE` entries in `backend/rules/` with real advisories.
- [ ] **Held-out test set:** 20 scam and 10 genuine messages in `eval/holdout/cases.jsonl`, written by someone who has **never seen** `backend/rules/`. Then run `python scripts/run_eval.py --freeze-holdout`. Rule authors must not write or read it.
- [ ] Add development cases in `eval/dev/cases.jsonl` from real advisories.
- [ ] Regenerate the evaluation report after rule changes (`deploy.sh` does this) and check the footer link. The committed copy predates the latest rule fixes.
- [ ] **Translations:** native review of all non-English text, starting with emergency, consent and report wording. Files are in `frontend/src/i18n/`.
- [ ] **Tamil audio** is missing: `frontend/public/audio/` has only `en` and `hi`.

### Decisions and deliverables
- [ ] **Bedrock:** the spec retires runtime model calls, and the Techfest rules and FAQs showed no Bedrock requirement. Check the Problem Statement. If not required, remove the explain route, its Lambda and the frontend call.
- [ ] Prepare what the submission asks for (idea brief, build summary, demo video as applicable).
- [ ] Add a `README.md` (setup, architecture, privacy, limits).

## P2: spec release gates and real public use

- [ ] Five first-time users do the report task with synthetic receipts; record time, errors and incomplete cases.
- [ ] Measure speed on a named mid-range phone (reporting action visible within 2 s; initial JavaScript at most 300 KB compressed).
- [ ] Keyboard and screen-reader testing.
- [ ] Independent OCR test on receipt layouts the rules have not seen.
- [ ] Check security headers on the deployed site and AWS provider data settings.
- [ ] Scam rules, reviewed explanations and AI wording for Bengali, Marathi, Telugu, Kannada and Malayalam (today only English, Hindi, Tamil).
- [ ] Privacy and legal review, monitoring, and a named person to respond to problems.
- [ ] Re-audit the code against `MASTER_CONTROL_SPEC.md` §6–8; this list may not cover every item.

## Rules to keep

- No government emblems, flag or ministry names. Keep "Not a government service".
- Case details are never saved in browser storage or the URL.
- Nothing from a screenshot counts until the user confirms it.
- Never tell a user a message is safe.
- Every language file needs every key (the tests enforce this).
- Use only synthetic data in tests and demos.
