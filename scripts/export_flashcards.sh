#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v uv >/dev/null 2>&1; then
  echo "export_flashcards: the 'uv' CLI is not installed." >&2
  exit 1
fi

run=(uv run --script "$ROOT/tools/export/export_flashcards.py" "$@")

# A full export takes hours; keep the machine from sleeping through it.
if command -v systemd-inhibit >/dev/null 2>&1; then
  exec systemd-inhibit --what=sleep:idle --who=export_flashcards --why="exporting flashcards" "${run[@]}"
fi
exec "${run[@]}"
