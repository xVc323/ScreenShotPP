#!/usr/bin/env bash
set -euo pipefail

input=${1:?usage: scripts/optimize-demo-gif.sh INPUT_VIDEO [OUTPUT_GIF]}
output=${2:-docs/assets/screenshotpp-demo.gif}
max_bytes=8000000
palette=$(mktemp -t screenshotpp-palette).png
trap 'rm -f "$palette"' EXIT

mkdir -p "$(dirname "$output")"

ffmpeg -y -i "$input" \
  -vf "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$palette"

ffmpeg -y -i "$input" -i "$palette" \
  -lavfi "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  "$output"

if stat -f%z "$output" >/dev/null 2>&1; then
  bytes=$(stat -f%z "$output")
else
  bytes=$(stat -c%s "$output")
fi

if (( bytes > max_bytes )); then
  echo "GIF is too large: $bytes bytes (max: $max_bytes)" >&2
  exit 1
fi

echo "Created $output ($bytes bytes)"
