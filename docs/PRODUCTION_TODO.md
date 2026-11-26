# Asli Ya Nakli: what is left before production

Written 27 Nov 2026 for branch `sujith-updates`. **Current state: working prototype, not production ready.**

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
| Frontend tests | 27 passed |
| Python tests | 173 passed; `test_llm.py` and `test_ledger.py` not run on the latest code |
| Browser tests (desktop, phone, tablet sizes) | Passed with a mocked server, bundled with esbuild |
| `vite build`, `npm run dev` | **Not yet run on the redesign** |
| Real phones, deployed AWS | **Not tested** |
| Live URL | Still runs the old version |

## P0: before any demo

- [ ] `npm run build` and `npm run dev` work. After pushing, the GitHub Actions run is green.
- [ ] Click through every page on a laptop and a real phone.
- [ ] **Hindi false alarm.** Some genuine advisories score "likely scam", for example one beginning "सावधान! पुलिस कभी वीडियो कॉल पर गिरफ्तार नहीं करती…". Also re-test these English ones: "CBI officers do not arrest people over video calls…", "There is no such thing as digital arrest…". Change `backend/common/rules.py` and `frontend/src/lib/checker.ts` together, and add cases to `tests/parity_cases.json`.
- [ ] **Empty re-read.** A screenshot read again with no result says "no fields" while old readings remain (`frontend/src/case/model.ts`).
- [ ] **Failed payments** are worded "not sure it went through" in the report (`frontend/src/pack/`).
- [ ] **Marathi detection** is a short word list (`frontend/src/lib/readable.ts`). A Marathi message it misses can show "no known scam pattern". Widen it and test with real examples.

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
