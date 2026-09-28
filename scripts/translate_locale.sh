#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${BWS_PROJECT_ID:-da0d011e-424f-44eb-a9d1-b4b001437287}"

if ! command -v uv >/dev/null 2>&1; then
  echo "translate_locale: the 'uv' CLI is not installed." >&2
  exit 1
fi

run=(uv run --script "$ROOT/tools/locale/translate.py" "$@")

# A run takes hours; keep the machine from sleeping through it.
awake=()
if command -v systemd-inhibit >/dev/null 2>&1; then
  awake=(systemd-inhibit --what=sleep:idle --who=translate_locale --why="translating locales")
fi

# Already have the key in the environment, or not calling the API at all?
# Skip the vault round-trip.
if [[ -n "${OPENROUTER_API_KEY:-}" || " $* " =~ \ (--dry-run|--check|--test|-h|--help)\  ]]; then
  exec "${awake[@]}" "${run[@]}"
fi

if ! command -v bws >/dev/null 2>&1; then
  echo "translate_locale: the 'bws' CLI is not installed." >&2
  exit 1
fi

exec "${awake[@]}" bws run --project-id "$PROJECT_ID" -- "${run[@]}"
