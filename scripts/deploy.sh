#!/usr/bin/env bash
# Build and deploy everything:  AWS_PROFILE=asli bash scripts/deploy.sh [--use-container] [Key=Value ...]
#   bash scripts/deploy.sh                                  # interim: site served by API Gateway (no CloudFront)
#   bash scripts/deploy.sh UseCloudFront=true               # once the account is verified for CloudFront
#   bash scripts/deploy.sh AlarmEmail=you@example.com LlmProvider=bedrock
# eval report + samples -> frontend test/build -> sam build -> sam deploy -> (CloudFront mode: s3 sync + invalidate)
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION=ap-south-1 PYTHONUTF8=1
# sam build needs python3.12 on PATH; the project venv provides it (system python may be older).
for venv_bin in .venv/Scripts .venv/bin; do
  [ -d "$venv_bin" ] && export PATH="$PWD/$venv_bin:$PATH" && break
done
SAM=sam; command -v sam >/dev/null 2>&1 || SAM=sam.cmd  # Windows installs sam.cmd

BUILD_ARGS=()
OVERRIDES=()
CLOUDFRONT=false
for arg in "$@"; do
  case "$arg" in
    --use-container) BUILD_ARGS+=(--use-container) ;;
    UseCloudFront=true) CLOUDFRONT=true; OVERRIDES+=("$arg") ;;
    *=*) OVERRIDES+=("$arg") ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# A running dev server locks native files in node_modules (Windows), and `npm ci` then fails half-way.
if (exec 3<>/dev/tcp/127.0.0.1/5173) 2>/dev/null; then
  echo "A dev server is running on :5173. Stop scripts/dev.sh (Ctrl+C) before deploying." >&2
  exit 1
fi

echo "== evaluation report + demo seeds (bundled into the site)"
python scripts/run_eval.py && python scripts/make_samples.py

echo "== frontend test + build"
(cd frontend && npm ci --no-audit --no-fund && npm test && npm run build)
node scripts/check_bundle_size.mjs
rm -rf static_site/dist && cp -r frontend/dist static_site/dist

echo "== sam build"
"$SAM" build "${BUILD_ARGS[@]}"

BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
echo "== sam deploy (build $BUILD_ID, CloudFront=$CLOUDFRONT)"
"$SAM" deploy --parameter-overrides "BuildId=$BUILD_ID" "UseCloudFront=$CLOUDFRONT" "${OVERRIDES[@]}"

out() {
  aws cloudformation describe-stacks --stack-name asli-ya-nakli \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text | tr -d '\r'
}
URL=$(out SiteUrl)

if [ "$CLOUDFRONT" = true ]; then
  BUCKET=$(out SiteBucketName)
  DIST=$(out DistributionId)
  echo "== upload site to s3://$BUCKET"
  # Hashed assets are immutable; everything else must revalidate so new deploys show up.
  # No --delete: the previous build's hashed files stay, so open tabs and a rollback still find them.
  aws s3 sync frontend/dist "s3://$BUCKET" \
    --exclude "index.html" --exclude "sw.js" --exclude "registerSW.js" --exclude "manifest.webmanifest" \
    --exclude "workbox-*.js" --exclude "audio/*" --exclude "samples/*" --exclude "eval-report.md" \
    --cache-control "public, max-age=31536000, immutable"
  aws s3 sync frontend/dist "s3://$BUCKET" \
    --exclude "*" --include "audio/*" --include "samples/*" --include "workbox-*.js" --include "eval-report.md" \
    --cache-control "public, max-age=86400"
  for f in index.html sw.js registerSW.js manifest.webmanifest; do
    [ -f "frontend/dist/$f" ] && aws s3 cp "frontend/dist/$f" "s3://$BUCKET/$f" --cache-control "no-cache"
  done
  echo "== CloudFront invalidation"
  aws cloudfront create-invalidation --distribution-id "$DIST" \
    --paths /index.html /sw.js /registerSW.js /manifest.webmanifest --query "Invalidation.Id" --output text
fi

echo
echo "Deployed: $URL"
echo "Screenshot reading starts PAUSED (ledger policy is fail-closed). To enable it:"
echo "  python scripts/ocr_switch.py on"
echo "Then: bash scripts/smoke.sh $URL"
