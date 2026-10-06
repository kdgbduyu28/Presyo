#!/usr/bin/env bash
#
# Build Presyo for the web (app + data) and deploy it to Cloudflare Pages.
#
#   ./scripts/release.sh               # rebuild data/JSON, build, deploy to presyo.pages.dev
#   ./scripts/release.sh --fetch       # also fetch new government reports first
#   ./scripts/release.sh --no-deploy   # build only
#
# Same Cloudflare flow as pabili/scripts/release.sh. CI (.github/workflows/update.yml)
# runs the same script with --fetch twice a day. Locally wrangler uses your login;
# in CI it uses the CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID environment.

set -euo pipefail

PROJECT=presyo
WRANGLER=(npx --yes wrangler@4)
export WRANGLER_SEND_METRICS=false

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY=true
FETCH=false

for arg in "$@"; do
  case "$arg" in
    --no-deploy) DEPLOY=false ;;
    --fetch)     FETCH=true ;;
    -h|--help)   sed -n '3,12p' "$0"; exit 0 ;;
    *) echo "release.sh: unknown option '$arg'" >&2; exit 2 ;;
  esac
done

cd "$ROOT/ingest"
if [[ "$FETCH" == true ]]; then
  echo "==> fetching new reports"
  uv run presyo-ingest all
else
  echo "==> building app data"
  uv run presyo-ingest build
fi

if [[ "$DEPLOY" == true && -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "==> checking Cloudflare login"
  if ! whoami_out="$("${WRANGLER[@]}" whoami </dev/null 2>&1)" \
      || ! grep -qi "you are logged in" <<<"$whoami_out"; then
    echo "$whoami_out" >&2
    echo "release.sh: not signed in. Run: npx wrangler@4 login   (or pass --no-deploy)" >&2
    exit 1
  fi
fi

echo "==> building web app"
cd "$ROOT/app"
rm -rf dist
npx expo export --platform web --output-dir dist </dev/null

# Wrangler never uploads folders named node_modules, so fonts Expo exports to
# assets/node_modules/... would 404. Move them and point the bundle at the new path.
if [[ -d dist/assets/node_modules ]]; then
  mv dist/assets/node_modules dist/assets/vendor
  grep -rlF '/assets/node_modules/' dist --include='*.js' --include='*.html' --include='*.css' \
    | xargs sed -i.bak 's#/assets/node_modules/#/assets/vendor/#g'
  find dist -name '*.bak' -delete
fi

if [[ "$DEPLOY" == false ]]; then
  echo "Built: $ROOT/app/dist ($(du -sh dist | cut -f1)), not deployed"
  exit 0
fi

# Create the Pages project on first deploy (classic Pages project, see pabili).
if ! "${WRANGLER[@]}" pages project list </dev/null 2>/dev/null | grep -q "│ ${PROJECT} "; then
  echo "==> creating Pages project ${PROJECT}"
  "${WRANGLER[@]}" pages project create "$PROJECT" --production-branch main --force </dev/null
fi

echo "==> deploying to ${PROJECT}.pages.dev"
"${WRANGLER[@]}" pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true </dev/null

echo ""
echo "Live: https://${PROJECT}.pages.dev"
