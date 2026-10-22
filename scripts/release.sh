#!/usr/bin/env bash
#
# Build Presyo for the web (app + data) and deploy it to Cloudflare Pages.
#
#   ./scripts/release.sh               # rebuild data/JSON, build, deploy to presyo.pages.dev
#   ./scripts/release.sh --fetch       # also fetch new government reports first
#   ./scripts/release.sh --no-deploy   # build only
#   ./scripts/release.sh --apk         # Android: tag + push; GitHub builds the APK into Releases
#   ./scripts/release.sh --apk=v1.2.0  # same, with an explicit version (default: app/app.json)
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
APK=false
APK_TAG=

for arg in "$@"; do
  case "$arg" in
    --no-deploy) DEPLOY=false ;;
    --fetch)     FETCH=true ;;
    --apk)       APK=true ;;
    --apk=*)     APK=true; APK_TAG="${arg#--apk=}" ;;
    -h|--help)   sed -n '3,14p' "$0"; exit 0 ;;
    *) echo "release.sh: unknown option '$arg'" >&2; exit 2 ;;
  esac
done

# --apk: tag this commit and push the tag. GitHub Actions
# (.github/workflows/android-release.yml) builds the APK from that tag and attaches it to
# the repository's Releases page, so nothing is built here and it costs nothing.
release_apk() {
  local tag="$1"
  cd "$ROOT"
  [[ -n "$tag" ]] || tag="v$(node -p 'require("./app/app.json").expo.version')"
  [[ "$tag" == v* ]] || tag="v$tag"
  if ! git remote get-url origin >/dev/null 2>&1; then
    echo "release.sh: no GitHub remote yet; create the repo and push it first" >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "release.sh: commit your changes first; the APK is built from GitHub, not this folder" >&2
    exit 1
  fi
  git fetch --quiet origin
  if ! git merge-base --is-ancestor HEAD '@{u}' 2>/dev/null; then
    echo "release.sh: push this branch first (git push); the APK is built from GitHub" >&2
    exit 1
  fi
  if git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null \
      || git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null; then
    echo "release.sh: $tag already exists; bump the version or pass --apk=vX.Y.Z" >&2
    exit 1
  fi
  git tag -a "$tag" -m "$tag"
  git push --quiet origin "refs/tags/$tag"
  local repo
  repo="$(git remote get-url origin | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')"
  echo "Tagged $tag; GitHub Actions is building the APK (15-25 min):"
  echo "  progress: https://github.com/$repo/actions/workflows/android-release.yml"
  echo "  download: https://github.com/$repo/releases/tag/$tag"
}

if [[ "$APK" == true ]]; then
  release_apk "$APK_TAG"
  exit 0
fi

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
