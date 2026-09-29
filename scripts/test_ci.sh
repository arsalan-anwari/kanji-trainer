#!/usr/bin/env bash
#
# Runs the ci workflow (.github/workflows/ci.yml) on this machine.
#
# Usage:
#   scripts/test_ci.sh              run both jobs through act, in the ubuntu-24.04 runner image
#   scripts/test_ci.sh --no-act     run the same steps directly here, against the local data/
#   scripts/test_ci.sh --fix        apply rustfmt before checking, instead of only failing on it
#
# The flags combine. Through act the job checks out the working tree without
# its gitignored files, so it downloads the packs from Hugging Face like CI
# does, and the playwright report lands in tmp/act-artifacts. Needs docker and
# act (https://nektosact.com/installation/).
#
# --no-act skips what only a fresh runner needs: the pack download (it reads
# data/, run scripts/sync_data.sh --download once), the apt packages and the
# playwright system deps. It still runs npm ci, so node_modules is rebuilt from
# the lockfile. Port 4173 has to be free for the playwright web server.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

WORKFLOW=.github/workflows/ci.yml
RUNNER_IMAGE=catthehacker/ubuntu:act-24.04
MANIFEST=src-tauri/Cargo.toml

usage() {
  sed -n '3,18s/^# \{0,1\}//p' "$0"
}

use_act=true
fix=false
for arg in "$@"; do
  case "$arg" in
    --no-act) use_act=false ;;
    --fix) fix=true ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
  esac
done

if $fix; then
  echo "==> Formatting the rust backend"
  cargo fmt --manifest-path "$MANIFEST"
fi

if $use_act; then
  command -v act >/dev/null || {
    echo "act is not installed, see https://nektosact.com/installation/ or pass --no-act" >&2
    exit 1
  }
  exec act push -W "$WORKFLOW" \
    -P ubuntu-24.04="$RUNNER_IMAGE" \
    --artifact-server-path tmp/act-artifacts
fi

frontend() {
  [ -d data/packs ] || {
    echo "data/packs is missing, run scripts/sync_data.sh --download first" >&2
    return 1
  }
  echo "==> Installing the node packages"
  npm ci --no-audit --no-fund
  echo "==> Installing the browser"
  npx playwright install chromium
  echo "==> Type checking the frontend"
  npm run check
  echo "==> Running the frontend tests"
  npm run test
  echo "==> Building the frontend"
  npm run build
  echo "==> Running the end-to-end tests"
  # CI=1 gives the CI config: a fresh server, one retry, no test.only
  CI=1 npx playwright test --reporter=list
}

backend() {
  # tauri_build reads src-tauri/dist, the frontend job may have stopped before building it
  [ -d src-tauri/dist ] || npm run build
  echo "==> Checking rust formatting"
  cargo fmt --manifest-path "$MANIFEST" --check
  echo "==> Building the rust backend"
  cargo check --manifest-path "$MANIFEST"
  echo "==> Running the rust tests"
  cargo test --manifest-path "$MANIFEST" --no-default-features
}

# Like the two CI jobs, a failed step ends its own job but not the other one.
# The rust job reads src-tauri/dist, which the frontend job builds.
set +e
(set -e; frontend); front=$?
(set -e; backend); back=$?
set -e

echo
[ "$front" -eq 0 ] && echo "==> frontend checks passed" || echo "==> frontend checks FAILED"
[ "$back" -eq 0 ] && echo "==> rust checks passed" || echo "==> rust checks FAILED"
[ "$front" -eq 0 ] && [ "$back" -eq 0 ]
