#!/usr/bin/env bash
set -euo pipefail

input=${1:?usage: scripts/optimize-demo-gif.sh INPUT_VIDEO [OUTPUT_GIF]}
output=${2:-docs/assets/screenshotpp-demo.gif}
max_bytes=8000000
output_dir=$(dirname "$output")
mkdir -p "$output_dir"
temp_dir=$(mktemp -d "$output_dir/.screenshotpp-demo.XXXXXX")
palette="$temp_dir/palette.png"
candidate="$temp_dir/output.gif"
trap 'rm -rf "$temp_dir"' EXIT

ffmpeg -y -i "$input" \
  -vf "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$palette"

ffmpeg -y -i "$input" -i "$palette" \
  -lavfi "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  "$candidate"

if stat -f%z "$candidate" >/dev/null 2>&1; then
  bytes=$(stat -f%z "$candidate")
else
  bytes=$(stat -c%s "$candidate")
fi

if (( bytes >= max_bytes )); then
  echo "GIF is too large: $bytes bytes (must be under $max_bytes)" >&2
  exit 1
fi

mv "$candidate" "$output"

echo "Created $output ($bytes bytes)"
