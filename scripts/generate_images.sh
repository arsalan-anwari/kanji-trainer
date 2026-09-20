#!/usr/bin/env bash
set -euo pipefail

# Generate the hint images in data/images/ with the Recraft API, with
# RECRAFT_API_KEY pulled from Bitwarden Secrets Manager. Every flag is passed
# straight through to tools/images/generate.py; run with --help for the list.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${BWS_PROJECT_ID:-da0d011e-424f-44eb-a9d1-b4b001437287}"

# Already have the key in the environment (or only doing --dry-run/--check)?
# Skip the vault round-trip.
if [[ -n "${RECRAFT_API_KEY:-}" || " $* " == *" --dry-run "* || " $* " == *" --check "* ]]; then
  exec python3 "$ROOT/tools/images/generate.py" "$@"
fi

if ! command -v bws >/dev/null 2>&1; then
  echo "generate_images: the 'bws' CLI is not installed." >&2
  exit 1
fi

exec bws run --project-id "$PROJECT_ID" -- python3 "$ROOT/tools/images/generate.py" "$@"
