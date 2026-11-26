#!/usr/bin/env bash
# Smoke test for a running stack (v3). Works for local and AWS:
#   bash scripts/smoke.sh http://localhost:5173
#   bash scripts/smoke.sh https://dxxxxxxxx.cloudfront.net
# Spends at most 1 OCR admission of the daily budget (plus one deliberate duplicate that is refused).
set -uo pipefail
BASE="${1:?usage: smoke.sh <base-url>}"
BASE="${BASE%/}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fails=0
uuid() { node -e "console.log(crypto.randomUUID())"; }

check() { # name expected actual [ok|no] [detail]
  if [ "$3" = "$2" ] && [ "${4:-ok}" = "ok" ]; then echo "PASS  $1 ($3)"; else echo "FAIL  $1 (got $3, want $2) ${5:-}"; fails=$((fails+1)); fi
}
has() { grep -q "$1" "$TMP/out" && echo ok || echo no; }
ocr() { # file content-type key image-id
  curl -s -o "$TMP/out" -w '%{http_code}' -X POST "$BASE/api/v3/ocr" -H "content-type: $2" \
    -H "idempotency-key: $3" -H "x-image-id: $4" --data-binary "@$1"
}
json() { curl -s -o "$TMP/out" -w '%{http_code}' -X POST "$BASE$1" -H 'content-type: application/json' --data-binary "$2"; }

s=$(curl -s -o "$TMP/out" -w '%{http_code}' "$BASE/api/v3/health"); check "GET /api/v3/health" 200 "$s" "$(has '"status":"ok"')" "$(head -c 200 "$TMP/out")"

IMG="$ROOT/eval/ocr/images/seed_b1.jpg"
KEY=$(uuid); IID=$(uuid)
s=$(ocr "$IMG" image/jpeg "$KEY" "$IID"); check "POST /api/v3/ocr synthetic receipt -> candidates" 200 "$s" "$(has 000000000321)" "$(head -c 300 "$TMP/out")"
sleep 1.2
s=$(ocr "$IMG" image/jpeg "$KEY" "$IID"); check "same Idempotency-Key again -> refused, no second Textract call" 409 "$s" "$(has ALREADY_ATTEMPTED)"
s=$(ocr "$IMG" image/png "$(uuid)" "$(uuid)"); check "wrong media type -> 415" 415 "$s"
head -c 1300000 /dev/zero > "$TMP/big.bin"; printf '\xff\xd8\xff' | dd of="$TMP/big.bin" conv=notrunc 2>/dev/null
s=$(ocr "$TMP/big.bin" image/jpeg "$(uuid)" "$(uuid)"); check "1.3 MB body -> 413" 413 "$s"
s=$(ocr "$IMG" image/jpeg "not-a-uuid" "$(uuid)"); check "bad Idempotency-Key -> 400" 400 "$s"

s=$(json /api/v3/explain '{"lang":"en","tier":"likely_scam","family":"digital_arrest","ruleIds":["DA-03"]}')
if [ "$s" = 200 ] || [ "$s" = 503 ]; then echo "PASS  POST /api/v3/explain ($s; 503 = model off/capped, template used)"; else echo "FAIL  explain ($s)"; fails=$((fails+1)); fi
s=$(json /api/v3/explain '{"lang":"en","tier":"likely_scam","family":null,"ruleIds":["DA-03"],"text":"a message"}')
check "explain refuses free text -> 400" 400 "$s"

s=$(curl -s -o "$TMP/out" -w '%{http_code}' "$BASE/api/v3/nope"); check "unknown API route -> 404, not the app shell" 404 "$s" "$(has UNKNOWN_ROUTE)"
s=$(curl -s -o "$TMP/out" -w '%{http_code}' "$BASE/"); check "GET / shows 1930 before JavaScript" 200 "$s" "$(has 'tel:1930')"

echo
if [ "$fails" -eq 0 ]; then echo "All smoke checks passed."; else echo "$fails smoke check(s) failed."; fi
exit "$fails"
