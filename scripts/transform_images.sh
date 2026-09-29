#!/usr/bin/env bash
set -euo pipefail

# Make the pack pictures transparent: paper out, ink kept. Every flag is passed
# straight through to tools/images/transform.py; run with --help for the list.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v uv >/dev/null 2>&1; then
  echo "transform_images: the 'uv' CLI is not installed." >&2
  exit 1
fi

exec uv run --script "$ROOT/tools/images/transform.py" "$@"
