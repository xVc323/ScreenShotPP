#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "release readiness: $*" >&2
  exit 1
}

version=$(node -p "require('./package.json').version")
tauri_version=$(node -p "require('./src-tauri/tauri.conf.json').version")
cargo_version=$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1)
release_notes=".github/release-notes/v${version}.md"

[[ "$version" == "$tauri_version" ]] || fail "package.json and tauri.conf.json versions differ"
[[ "$version" == "$cargo_version" ]] || fail "package.json and Cargo.toml versions differ"

for file in \
  LICENSE \
  README.md \
  docs/assets/screenshotpp-demo.gif \
  .github/workflows/release.yml \
  "$release_notes"
do
  [[ -s "$file" ]] || fail "missing $file"
done

grep -q "A fast, native screenshot tool" README.md || fail "README tagline missing"
grep -q "docs/assets/screenshotpp-demo.gif" README.md || fail "README GIF missing"
grep -q "Windows preview" README.md || fail "README Windows preview warning missing"
grep -q 'tags:' .github/workflows/release.yml || fail "release tag trigger missing"
grep -q 'npm run tauri build -- --bundles app,dmg' .github/workflows/release.yml || fail "macOS DMG build missing"
grep -q 'npm run tauri build -- --bundles nsis' .github/workflows/release.yml || fail "Windows NSIS build missing"
grep -q 'APPLE_SIGNING_IDENTITY' .github/workflows/release.yml || fail "release signing identity missing"
grep -q 'APPLE_API_KEY_PATH' .github/workflows/release.yml || fail "notarization API key path missing"

if stat -f%z docs/assets/screenshotpp-demo.gif >/dev/null 2>&1; then
  gif_bytes=$(stat -f%z docs/assets/screenshotpp-demo.gif)
else
  gif_bytes=$(stat -c%s docs/assets/screenshotpp-demo.gif)
fi

(( gif_bytes <= 8000000 )) || fail "demo GIF exceeds 8 MB"

echo "release readiness: OK (v${version}, GIF ${gif_bytes} bytes)"
