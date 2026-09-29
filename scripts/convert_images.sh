#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v uv >/dev/null 2>&1; then
  echo "convert_images: the 'uv' CLI is not installed." >&2
  exit 1
fi

exec uv run --script "$ROOT/tools/images/convert.py" "$@"
