#!/usr/bin/env bash
# Regenerates everything under packaging/repo: the stills per device size, the
# two readme gifs, the social card and the promotion clip.
#
#   scripts/record.sh --all                    # everything, in dependency order
#   scripts/record.sh --showcase               # the stills and the two gifs
#   scripts/record.sh --thumbnail              # the 1920x1080 social card
#   scripts/record.sh --promo [out.mp4]        # the promotion clip
#
#   SKIP_BUILD=1 ...              reuse the current src-tauri/dist/
#   SHOWCASE_ONLY=phone ...       one size only, of desktop phone tablet7
#                                 tablet10 chromebook
#   SHOWCASE_HOLD=2.4 ...         a slower slideshow
#   PROMO_SPEED=1 ...             no speed up
#   PROMO_TRIM=0.8 ...            cut more off the front of the clip
#
# Needs ffmpeg, the playwright chromium browser and data/
# (scripts/sync_data.sh --download), with the nl and he pack locales: both the
# stills and the clip end on a run in Dutch and one right to left in Hebrew. The
# app ships its own japanese face, so no system CJK font is needed.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

REPO=packaging/repo
hold="${SHOWCASE_HOLD:-1.8}"
colors="${SHOWCASE_COLORS:-128}"
work="$root/.showcase"
backdrop=0xF2E8D7
built=0

usage() { awk 'NR>1 && !/^#/ {exit} NR>1 {sub(/^# ?/, ""); print}' "${BASH_SOURCE[0]}"; }

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing $1, $2" >&2; exit 1; }
}

# Builds the frontend at most once per run.
build_once() {
  [ "$built" = 0 ] || return 0
  built=1
  [ -d node_modules ] || { echo "run npm ci first" >&2; exit 1; }
  [ -f data/packs/index.json ] || { echo "data/ is missing, run scripts/sync_data.sh --download" >&2; exit 1; }
  if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo "==> building the frontend"
    npm run build
  fi
}

frame_size() {
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$1"
}

# showcase

# Only the two readme sizes turn into a gif. The store sizes are shot for their
# stills alone, so they answer with nothing here and get skipped.
target_gif() {
  case "$1" in
    desktop) echo "$REPO/showcase.gif" ;;
    phone) echo "$REPO/showcase-phone.gif" ;;
    *) echo "" ;;
  esac
}

target_width() {
  case "$1" in
    desktop) echo "${SHOWCASE_WIDTH:-800}" ;;
    phone) echo "${SHOWCASE_PHONE_WIDTH:-360}" ;;
    *) echo 800 ;;
  esac
}

# Turns a folder of stills into one gif.
build_gif() {
  local dir="$1" out="$2" width="$3"

  shopt -s nullglob
  local frames=("$dir"/*.png)
  shopt -u nullglob
  [ "${#frames[@]}" -gt 0 ] || { echo "no stills in $dir" >&2; exit 1; }

  # every frame must be the same size or the palette filter fails
  local first size
  first="$(frame_size "${frames[0]}")"
  for frame in "${frames[@]}"; do
    size="$(frame_size "$frame")"
    [ "$size" = "$first" ] || { echo "$frame is ${size/,/x}, expected ${first/,/x}" >&2; exit 1; }
  done

  mkdir -p "$work"
  local name list palette last index seconds
  name="$(basename "$out" .gif)"
  list="$work/$name.txt"
  palette="$work/$name-palette.png"
  last=$(( ${#frames[@]} - 1 ))
  index=0
  : > "$list"

  for frame in "${frames[@]}"; do
    seconds="$hold"
    # hold longer on the opening and closing frames
    if [ "$index" -eq 0 ] || [ "$index" -eq "$last" ]; then
      seconds="$(awk -v h="$hold" 'BEGIN { printf "%.2f", h * 1.7 }')"
    fi
    printf "file '%s'\nduration %s\n" "$root/$frame" "$seconds" >> "$list"
    index=$(( index + 1 ))
  done
  # concat drops the duration of its last entry, so list that frame twice
  printf "file '%s'\n" "$root/${frames[$last]}" >> "$list"

  local scale="scale=$width:-2:flags=lanczos"

  ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" \
    -vf "$scale,palettegen=max_colors=$colors:stats_mode=diff" "$palette"

  ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" -i "$palette" \
    -lavfi "$scale[frames];[frames][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
    -fps_mode vfr -loop 0 "$out"

  echo "==> ${#frames[@]} frames into $out ($(du -h "$out" | cut -f1))"
}

showcase() {
  need ffmpeg "install it from your package manager"
  need ffprobe "it ships with ffmpeg"
  need npx "install node 22 or newer"
  build_once

  local targets=(desktop phone tablet7 tablet10 chromebook)
  [ -z "${SHOWCASE_ONLY:-}" ] || targets=("$SHOWCASE_ONLY")

  for target in "${targets[@]}"; do
    local dir="$REPO/$target" gif
    echo "==> shooting $target"
    mkdir -p "$dir"
    # drop stale stills before recording
    rm -f "$dir"/*.png
    npx playwright test --config tools/showcase/showcase.config.ts --project="$target"
    gif="$(target_gif "$target")"
    [ -z "$gif" ] || build_gif "$dir" "$gif" "$(target_width "$target")"
  done
}

# thumbnail

# Renders the 16:9 social card from the first desktop still.
thumbnail() {
  need ffmpeg "install it from your package manager"
  local src="$REPO/desktop/01_Setup_Reading.png"
  [ -f "$src" ] || { echo "$src is missing, run --showcase first" >&2; exit 1; }

  ffmpeg -hide_banner -loglevel error -y -i "$src" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$backdrop" \
    "$REPO/promo-thumbnail.png"
  echo "==> $REPO/promo-thumbnail.png (1920x1080)"
}

# promo

promo() {
  local out="${1:-$REPO/promo.mp4}"
  local raw="$root/.promo/raw"

  need ffmpeg "install it from your package manager"
  need npx "install node 22 or newer"
  build_once

  echo "==> recording"
  rm -rf "$raw"
  npx playwright test --config tools/promo/promo.config.ts

  local webm
  webm="$(find "$raw" -name '*.webm' -print -quit)"
  [ -n "$webm" ] || { echo "no recording was produced" >&2; exit 1; }

  echo "==> encoding $out"
  mkdir -p "$(dirname "$out")"

  # store uploads reject the constrained baseline stream openh264 produces, so
  # libx264 is required rather than a fallback. Held in a variable because grep
  # would close the pipe early and pipefail would read that as a failure.
  local encoders
  encoders="$(ffmpeg -hide_banner -encoders 2>/dev/null)"
  grep -q ' libx264 ' <<<"$encoders" || {
    echo "ffmpeg has no libx264, store listings will not take the upload" >&2
    echo "install it (dnf install ffmpeg, or a build with --enable-libx264)" >&2
    exit 1
  }

  # exactly 1920x1080, whatever the recording came out as
  local fit="scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos"
  fit="$fit,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$backdrop"

  local speed="${PROMO_SPEED:-1.1}"
  ffmpeg -hide_banner -loglevel error -y \
    -ss "${PROMO_TRIM:-0.6}" -i "$webm" \
    -vf "setpts=PTS/${speed},fps=30,$fit,format=yuv420p" \
    -an -c:v libx264 -preset slow -crf 20 \
    -profile:v high -level:v 4.0 -movflags +faststart \
    "$out"

  local seconds
  seconds="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" 2>/dev/null || echo '?')"
  echo "==> done: $out ($(frame_size "$out" | tr ',' 'x'), ${seconds}s, $(du -h "$out" | cut -f1))"
}

(($#)) || { usage; exit 1; }

do_showcase=0 do_thumbnail=0 do_promo=0
promo_out=""

while (($#)); do
  case "$1" in
    --all) do_showcase=1 do_thumbnail=1 do_promo=1 ;;
    --showcase) do_showcase=1 ;;
    --thumbnail) do_thumbnail=1 ;;
    --promo) do_promo=1 ;;
    -h | --help) usage; exit 0 ;;
    -*) echo "unknown flag $1" >&2; usage >&2; exit 1 ;;
    *) promo_out="$1" ;;
  esac
  shift
done

# the stills feed the thumbnail, so run them in that order
((do_showcase)) && showcase
((do_thumbnail)) && thumbnail
((do_promo)) && promo "$promo_out"
exit 0
