# Chaos checklist (run locally, then again on the live URL)

Tick each one. Write down anything that surprised you.

| # | Do this | Expect |
|---|---|---|
| 1 | DevTools → Network → **Slow 3G**, load the home page | Loads; "Checking server…" then status. Samples open instantly. |
| 2 | DevTools → **Offline** after one visit, reload | App shell, samples, scary-call screen and Saathi audio still open (service worker). |
| 3 | Upload a **10 MB photo** | Browser shrinks it to ≤ 1.2 MB and it uploads fine. |
| 4 | Upload a **corrupt file** renamed to `.jpg` | Friendly error, no stack trace. Server answers 422 if it reaches it. |
| 5 | **Double-click** Check / Read screenshots | Button disables; only one request is sent. |
| 6 | DevTools device toolbar at **360 × 640** | No sideways scrolling; all buttons are at least 44 px tall. |
| 7 | **Force the LLM to fail**: `MOCK_LLM_FAIL=1 bash scripts/dev.sh` | Same tier; "Reduced mode" badge; template explanation in the chosen language. |
| 8 | Paste **2,001 characters** into Check (bypass the textarea limit with curl) | 413 "Message is too long". |
| 9 | Set `OCR_DAILY_CAP=1`, upload twice | Second: "Demo limit reached for today. Try a sample…" |
| 10 | Switch language mid-flow (EN → हिं → தமிழ்) | Text, sample results and 1930 script follow the language. |
| 11 | Golden Hour → edit the amount | "Screenshot showed ₹…" warning next to the field. |
| 12 | Refresh the page in the middle of the confirm form | Form contents come back (this tab only). |
| 13 | Incognito window, first visit, cold start (live URL) | First check under ~3 s; trace drawer shows the stages. |

On AWS also: `bash scripts/smoke.sh https://<cloudfront-domain>`, then call the raw
`execute-api` URL in a loop to see 429s from the route throttles.
