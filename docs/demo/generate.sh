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

rm -rf frames palette.png
node capture.mjs

ffmpeg -y -framerate 18 -i frames/f_%04d.png \
  -vf "scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" palette.png -loglevel error
ffmpeg -y -framerate 18 -i frames/f_%04d.png -i palette.png \
  -lavfi "scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  ../assets/screenshotpp-demo.gif -loglevel error

rm -rf frames palette.png
echo "Wrote docs/assets/screenshotpp-demo.gif ($(stat -f%z ../assets/screenshotpp-demo.gif 2>/dev/null || stat -c%s ../assets/screenshotpp-demo.gif) bytes)"
