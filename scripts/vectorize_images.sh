#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${BWS_PROJECT_ID:-da0d011e-424f-44eb-a9d1-b4b001437287}"

if [[ -n "${RECRAFT_API_KEY:-}" || " $* " == *" --dry-run "* ]]; then
  exec python3 "$ROOT/tools/images/vectorize.py" "$@"
fi

if ! command -v bws >/dev/null 2>&1; then
  echo "vectorize_images: the 'bws' CLI is not installed." >&2
  exit 1
fi

exec bws run --project-id "$PROJECT_ID" -- python3 "$ROOT/tools/images/vectorize.py" "$@"
