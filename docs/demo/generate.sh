#!/usr/bin/env bash
# Regenerate docs/assets/screenshotpp-demo.gif from the deterministic demo animation.
# Requires Node.js and ffmpeg. Playwright + Chromium are installed on first run.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

if [ ! -d node_modules/playwright ]; then
  npm init -y >/dev/null 2>&1 || true
  npm i playwright@1.60.0
  npx playwright install chromium
fi

asset_dir=../assets
mkdir -p "$asset_dir"
temp_dir=$(mktemp -d "$asset_dir/.screenshotpp-demo.XXXXXX")
candidate="$temp_dir/screenshotpp-demo.gif"
cleanup() { rm -rf frames palette.png "$temp_dir"; }
trap cleanup EXIT

node verify.mjs
rm -rf frames palette.png
# Chromium's first screenshot pass after a cold install can measure the overlay
# before its stable layout is painted. Discard one full pass so the committed
# artifact always comes from the warmed, reproducible geometry.
node capture.mjs >/dev/null
rm -rf frames
node capture.mjs

ffmpeg -y -framerate 18 -i frames/f_%04d.png \
  -vf "scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" palette.png -loglevel error
ffmpeg -y -framerate 18 -i frames/f_%04d.png -i palette.png \
  -lavfi "scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  "$candidate" -loglevel error

bytes=$(stat -f%z "$candidate" 2>/dev/null || stat -c%s "$candidate")
if (( bytes >= 5000000 )); then
  echo "README demo GIF is too large: $bytes bytes (must be under 5000000)" >&2
  exit 1
fi

mv "$candidate" "$asset_dir/screenshotpp-demo.gif"
echo "Wrote docs/assets/screenshotpp-demo.gif ($bytes bytes)"
