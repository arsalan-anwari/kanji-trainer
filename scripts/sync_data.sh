#!/usr/bin/env bash
set -euo pipefail

REPO="arsalan-anwari/kanji-data"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/data"

usage() {
  cat <<'USAGE'
Usage: scripts/sync_data.sh --upload | --download

  --upload     Publish data/ to the Hugging Face dataset, replacing what is
               there. data/README.md becomes the dataset card. Files under a
               subdirectory of the dataset that no longer exist locally are
               removed; .gitattributes at the dataset root is left alone.

  --download   Fetch the dataset into data/, skipping .gitattributes.

data/ is generated and is not in git. Regenerate it locally with
"npm run content:build", or fetch the published copy with --download.

Authentication comes from "hf auth login" or the HF_TOKEN environment variable.
USAGE
}

require_hf() {
  if ! command -v hf >/dev/null 2>&1; then
    echo "sync_data: the 'hf' CLI is not installed." >&2
    echo "  curl -LsSf https://hf.co/cli/install.sh | bash -s" >&2
    exit 1
  fi
  if ! hf auth whoami >/dev/null 2>&1; then
    echo "sync_data: not authenticated. Run 'hf auth login' or set HF_TOKEN." >&2
    exit 1
  fi
}

upload() {
  if [ ! -d "$DATA" ]; then
    echo "sync_data: $DATA does not exist. Run 'npm run content:build' first." >&2
    exit 1
  fi
  hf upload "$REPO" "$DATA" . \
    --type dataset \
    --delete "*/**" \
    --exclude ".cache/**" \
    --commit-message "Sync data/ from kanji-trainer"
}

download() {
  mkdir -p "$DATA"
  hf download "$REPO" \
    --type dataset \
    --local-dir "$DATA" \
    --exclude ".gitattributes"
  rm -rf "$DATA/.cache"
}

require_hf

case "${1:-}" in
  --upload) upload ;;
  --download) download ;;
  -h | --help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
