#!/usr/bin/env bash
set -euo pipefail

REPO="arsalan-anwari/kanji-data"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/data"

usage() {
  cat <<'USAGE'
Usage: scripts/sync_data.sh --upload | --download [--force]

  --upload     Publish all of data/, the curated data/overlay/ included, to
               the Hugging Face dataset, replacing what is there. It uploads
               data/archives/ and data/catalog.json as they are; run
               "npm run content:pack" first when a pack changed, so an upload
               of anything else (flashcards, overlay edits) never touches a
               pack's sha256 and never shows the learner an update. data/README.md becomes the dataset card. Files
               under a subdirectory of the dataset that no longer exist locally
               are removed; .gitattributes at the dataset root is left alone.

  --download   Fetch the dataset into data/, skipping .gitattributes. An
               existing data/overlay/ is left alone, since it may hold edits
               not uploaded yet; add --force to replace it with the published
               copy.

data/ is not in git; the dataset is its only home. After a clone, run
--download before anything else.

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
  local skip=()
  if [ -d "$DATA/overlay" ] && [ "${1:-}" != "--force" ]; then
    echo "sync_data: keeping the local data/overlay/; pass --force to replace it." >&2
    skip=(--exclude "overlay/**")
  fi
  mkdir -p "$DATA"
  hf download "$REPO" \
    --type dataset \
    --local-dir "$DATA" \
    --exclude ".gitattributes" \
    "${skip[@]}"
  rm -rf "$DATA/.cache"
}

require_hf

case "${1:-}" in
  --upload) upload ;;
  --download) download "${2:-}" ;;
  -h | --help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
