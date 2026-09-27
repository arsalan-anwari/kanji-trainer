#!/usr/bin/env bash
#
# Publishes the crate to crates.io.
#
# Usage:
#   scripts/publish.sh              build the frontend, then publish
#   scripts/publish.sh --dry-run    package and compile it, upload nothing
#
# Any other flag goes to cargo publish, e.g. --no-verify. Needs `cargo login`
# or CARGO_REGISTRY_TOKEN. A version on crates.io can never be replaced, run
# scripts/update_version.sh first.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

VERSION="$(node -p "require('./package.json').version")"

for file in src-tauri/Cargo.toml src-tauri/tauri.conf.json; do
  grep -q "\"\\?$VERSION\"\\?" "$file" || {
    echo "$file does not carry version $VERSION, stopping" >&2
    exit 1
  }
done

echo "==> Building the frontend into src-tauri/dist"
[ -d node_modules ] || npm ci --no-audit --no-fund
# Outside a tauri build vite copies data/ into dist, which would blow the
# 10 MB crate limit. Any value switches that off.
TAURI_ENV_PLATFORM=linux npm run build

echo "==> Publishing kanji-trainer $VERSION to crates.io"
cargo publish --manifest-path src-tauri/Cargo.toml --allow-dirty "$@"
