# Palier 4d.1 — Public GitHub Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish ScreenShotPP as a polished open-source GitHub project with an MIT license, an English product-first README, a short demo GIF, and an automated tag-driven release pipeline that ships a notarized macOS DMG plus an unsigned Windows NSIS preview installer.

**Architecture:** Keep product documentation and release automation in the repository so each tag is reproducible. Build macOS and Windows assets in independent GitHub Actions jobs, store them as workflow artifacts, and create the GitHub Release only from a final job that depends on both builds; this prevents incomplete public releases. Keep credential-gated Apple setup and the irreversible repository visibility change as explicit maintainer checkpoints.

**Tech Stack:** GitHub Actions, GitHub CLI, Tauri 2, Rust, Node.js 22, Apple Developer ID Application signing, App Store Connect API notarization, `ffmpeg`, Bash.

**Design:** `docs/superpowers/specs/2026-05-31-palier4d1-github-release-design.md`

**Primary references:**
- Tauri GitHub pipeline: <https://v2.tauri.app/distribute/pipelines/github/>
- Tauri macOS signing and notarization: <https://v2.tauri.app/distribute/sign/macos/>
- Apple Developer ID certificates: <https://developer.apple.com/help/account/certificates/create-developer-id-certificates/>

---

## File map

| Path | Responsibility |
|---|---|
| `LICENSE` | MIT license detected by GitHub |
| `README.md` | Public product landing page |
| `docs/assets/screenshotpp-demo.gif` | Short workflow demonstration embedded by README |
| `scripts/optimize-demo-gif.sh` | Reproducible GIF conversion and size guard |
| `scripts/check-release-readiness.sh` | Static release-storefront guard used locally and in CI |
| `.github/workflows/ci.yml` | Existing cross-platform CI extended with release-readiness validation |
| `.github/workflows/release.yml` | Tag-driven macOS and Windows release pipeline |
| `.github/release-notes/v0.1.0.md` | Deliberate release notes for the first public tag |
| `docs/distribution/github-release.md` | Maintainer-only procedure for Apple secrets, RC validation, repository visibility, and SignPath follow-up |

---

## Task 1: Create the MIT license and English product landing page

**Files:**
- Create: `LICENSE`
- Replace: `README.md`

- [ ] **Step 1: Write the MIT license**

Create `LICENSE`:

```text
MIT License

Copyright (c) 2026 xVc323

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Replace the template README with the product-first README**

Replace `README.md`:

````markdown
# ScreenShotPP

**A fast, native screenshot tool for macOS and Windows.**

Capture. Annotate. OCR. Copy. Done.

[Download for macOS](https://github.com/xVc323/ScreenShotPP/releases/latest) ·
[Download for Windows](https://github.com/xVc323/ScreenShotPP/releases/latest)

![ScreenShotPP demo](docs/assets/screenshotpp-demo.gif)

## Why ScreenShotPP?

ScreenShotPP is a lightweight open-source screenshot utility built for a fast daily
workflow. Trigger a global shortcut, select a region, annotate it, extract text with
native OCR when needed, then copy or save the result.

## Features

- Fast region capture on the monitor under your cursor
- Floating annotation toolbar
- Rectangles, ellipses, lines, arrows, freehand drawing and text
- Numbered bubbles for tutorials and documentation
- Mosaic tool for hiding sensitive information
- Native OCR on macOS and Windows
- Copy to clipboard or save to disk
- PNG and JPEG output with optional size targets
- Configurable global shortcut and persistent settings
- Menu bar / system tray background app

## Keyboard shortcut

The default capture shortcut is:

| Platform | Shortcut |
|---|---|
| macOS | `⌘ ⇧ 2` |
| Windows | `Ctrl ⇧ 2` |

You can change it from the ScreenShotPP settings window.

## Installation

### macOS

1. Download the latest `.dmg` from [GitHub Releases](https://github.com/xVc323/ScreenShotPP/releases/latest).
2. Open the DMG and drag ScreenShotPP into `Applications`.
3. Launch ScreenShotPP and grant Screen Recording permission when macOS asks.

### Windows preview

1. Download the latest NSIS `.exe` installer from [GitHub Releases](https://github.com/xVc323/ScreenShotPP/releases/latest).
2. Run the installer.
3. If Microsoft SmartScreen warns about the unsigned preview build, verify that the
   installer comes from this repository, then choose **More info** → **Run anyway**.

The Windows installer will be signed in a future release. The project will apply to
[SignPath Foundation](https://signpath.org/) after the first public release.

## Roadmap

- Mac App Store release
- Microsoft Store release
- Signed Windows GitHub installer

The GitHub version remains free and includes the complete feature set.

## Development

### Prerequisites

- [Node.js 22](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri platform prerequisites:
  [macOS](https://v2.tauri.app/start/prerequisites/#macos) or
  [Windows](https://v2.tauri.app/start/prerequisites/#windows)

### Run the checks

```bash
npm ci
cargo test --manifest-path src-tauri/Cargo.toml --lib
node --test src/accelerator.test.js src/editable-target.test.js src/editor/history.test.js src/editor/color.test.js src/editor/bubbles.test.js src/editor/editor.test.js src/editor/mosaic.test.js
```

### Build locally

```bash
npm run tauri build
```

Local macOS builds use the development signing identity configured in
`src-tauri/tauri.conf.json`. Public macOS releases are signed and notarized by GitHub
Actions with a Developer ID Application certificate.

## Contributing

Issues and pull requests are welcome. Please run the Rust and frontend checks before
submitting a change.

## License

[MIT](LICENSE)
````

- [ ] **Step 3: Verify the storefront text**

Run:

```bash
grep -n "A fast, native screenshot tool" README.md
grep -n "docs/assets/screenshotpp-demo.gif" README.md
grep -n "Windows preview" README.md
grep -n "Mac App Store release" README.md
grep -n "Microsoft Store release" README.md
grep -n "MIT License" LICENSE
git diff --check
```

Expected: each `grep` prints one matching line and `git diff --check` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add LICENSE README.md
git commit \
  -m "Present ScreenShotPP as an open-source desktop product" \
  -m "Constraint: The first public repository view must work for non-developers." \
  -m "Rejected: Keep the Tauri template README | It does not explain the product or installation path." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep the README English-first and feature-complete across free and Store channels." \
  -m "Tested: storefront grep checks; git diff --check" \
  -m "Not-tested: Demo GIF is added in the next task."
```

---

## Task 2: Produce the short workflow GIF

**Files:**
- Create: `scripts/optimize-demo-gif.sh`
- Create: `docs/assets/screenshotpp-demo.gif`

- [ ] **Step 1: Add the reproducible GIF optimization script**

Create `scripts/optimize-demo-gif.sh`:

```bash
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
```

Run:

```bash
chmod +x scripts/optimize-demo-gif.sh
```

- [ ] **Step 2: Record the raw demo**

On macOS, launch the current release build and use `⇧⌘5` → **Record Selected Portion**.
Record a short 8–12 second sequence:

1. press `⌘⇧2`;
2. select a region containing visible text;
3. draw one arrow or numbered bubble;
4. click **OCR**;
5. show the OCR preview briefly;
6. click **Copy text** or close the preview and copy the screenshot;
7. stop the recording.

Save the raw recording as:

```text
/tmp/screenshotpp-demo.mov
```

- [ ] **Step 3: Generate the optimized GIF**

Run:

```bash
scripts/optimize-demo-gif.sh /tmp/screenshotpp-demo.mov
```

Expected: `Created docs/assets/screenshotpp-demo.gif (...)` with fewer than `8000000`
bytes.

- [ ] **Step 4: Verify the GIF**

Run:

```bash
test -s docs/assets/screenshotpp-demo.gif
file docs/assets/screenshotpp-demo.gif
git diff --check
```

Expected:

```text
docs/assets/screenshotpp-demo.gif: GIF image data, ...
```

Open `README.md` in a Markdown preview and verify that the animation is readable and
loops cleanly.

- [ ] **Step 5: Commit**

```bash
git add scripts/optimize-demo-gif.sh docs/assets/screenshotpp-demo.gif
git commit \
  -m "Show the complete capture workflow in the repository storefront" \
  -m "Constraint: GitHub visitors should understand the product without reading implementation details." \
  -m "Rejected: Publish a static screenshot only | The capture-to-copy flow is the product's main advantage." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep the README GIF under 8 MB and regenerate it through the checked-in script." \
  -m "Tested: GIF size guard; file identification; Markdown preview; git diff --check" \
  -m "Not-tested: GitHub CDN rendering is verified after the branch is pushed."
```

---

## Task 3: Add a release-readiness guard and extend CI

**Files:**
- Create: `scripts/check-release-readiness.sh`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the release-readiness check**

Create `scripts/check-release-readiness.sh`:

```bash
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
grep -q 'npm run tauri build -- --bundles dmg' .github/workflows/release.yml || fail "macOS DMG build missing"
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
```

Run:

```bash
chmod +x scripts/check-release-readiness.sh
scripts/check-release-readiness.sh
```

Expected: FAIL with:

```text
release readiness: missing .github/workflows/release.yml
```

The missing workflow is implemented in Task 4.

- [ ] **Step 2: Add the guard to existing CI**

Append this step to `.github/workflows/ci.yml` after the frontend tests:

```yaml
      - name: Release storefront readiness
        shell: bash
        run: scripts/check-release-readiness.sh
```

- [ ] **Step 3: Verify that CI YAML still contains both logical suites**

Run:

```bash
grep -n "Cargo tests" .github/workflows/ci.yml
grep -n "Tests frontend" .github/workflows/ci.yml
grep -n "Release storefront readiness" .github/workflows/ci.yml
git diff --check
```

Expected: three matching step names and no whitespace errors.

Do not commit yet: the guard intentionally stays red until Task 4 adds the release
workflow and notes.

---

## Task 4: Implement the tag-driven release workflow

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `.github/release-notes/v0.1.0.md`
- Create: `docs/distribution/github-release.md`
- Modify: `scripts/check-release-readiness.sh` only if a verified path differs on the runner
- Modify: `.github/workflows/ci.yml` from Task 3

- [ ] **Step 1: Add the deliberate v0.1.0 release notes**

Create `.github/release-notes/v0.1.0.md`:

```markdown
## ScreenShotPP v0.1.0

ScreenShotPP is a fast, native screenshot tool for macOS and Windows.

### Highlights

- Region capture on the monitor under your cursor
- Floating annotation toolbar with shapes, arrows, text, numbered bubbles and mosaic
- Native OCR on macOS and Windows
- Clipboard copy and PNG / JPEG save
- Configurable shortcut and persistent settings

### macOS

Download the `.dmg`, drag ScreenShotPP into `Applications`, then grant Screen Recording
permission on first launch.

### Windows preview

Download and run the NSIS `.exe` installer. This first Windows preview installer is not
code-signed yet, so Microsoft SmartScreen may display a warning. Verify that your
download comes from this GitHub repository, then choose **More info** → **Run anyway**.

The Windows installer will be signed in a future release after the project applies to
SignPath Foundation.

### License

ScreenShotPP is open source under the MIT license.
```

- [ ] **Step 2: Add the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  workflow_dispatch:
  push:
    tags:
      - "v*"

permissions:
  contents: read

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: npm ci
      - name: Import Developer ID Application certificate
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$RUNNER_TEMP/certificate.p12"
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security set-keychain-settings -t 3600 -u build.keychain
          security import "$RUNNER_TEMP/certificate.p12" \
            -k build.keychain \
            -P "$APPLE_CERTIFICATE_PASSWORD" \
            -T /usr/bin/codesign
          security set-key-partition-list \
            -S apple-tool:,apple:,codesign: \
            -s \
            -k "$KEYCHAIN_PASSWORD" \
            build.keychain
          CERT_ID=$(security find-identity -v -p codesigning build.keychain |
            sed -n 's/.*"\(Developer ID Application:.*\)"/\1/p' |
            head -1)
          test -n "$CERT_ID"
          echo "APPLE_SIGNING_IDENTITY=$CERT_ID" >> "$GITHUB_ENV"
      - name: Prepare App Store Connect API key
        env:
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
          APPLE_API_PRIVATE_KEY: ${{ secrets.APPLE_API_PRIVATE_KEY }}
        run: |
          APPLE_API_KEY_PATH="$RUNNER_TEMP/AuthKey_${APPLE_API_KEY}.p8"
          printf '%s' "$APPLE_API_PRIVATE_KEY" > "$APPLE_API_KEY_PATH"
          chmod 600 "$APPLE_API_KEY_PATH"
          echo "APPLE_API_ISSUER=$APPLE_API_ISSUER" >> "$GITHUB_ENV"
          echo "APPLE_API_KEY=$APPLE_API_KEY" >> "$GITHUB_ENV"
          echo "APPLE_API_KEY_PATH=$APPLE_API_KEY_PATH" >> "$GITHUB_ENV"
      - name: Build signed and notarized DMG
        run: npm run tauri build -- --bundles dmg --target aarch64-apple-darwin
      - name: Validate stapled DMG
        run: xcrun stapler validate src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
      - uses: actions/upload-artifact@v4
        with:
          name: release-macos
          path: src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
          if-no-files-found: error

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: npm ci
      - name: Build Windows NSIS preview installer
        run: npm run tauri build -- --bundles nsis
      - uses: actions/upload-artifact@v4
        with:
          name: release-windows
          path: src-tauri/target/release/bundle/nsis/*-setup.exe
          if-no-files-found: error

  publish-release:
    if: startsWith(github.ref, 'refs/tags/')
    needs: [build-macos, build-windows]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          pattern: release-*
          path: release-assets
          merge-multiple: true
      - name: Publish complete GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          notes=".github/release-notes/${GITHUB_REF_NAME}.md"
          test -f "$notes"
          prerelease=()
          if [[ "$GITHUB_REF_NAME" == *-* ]]; then
            prerelease+=(--prerelease)
          fi
          gh release create "$GITHUB_REF_NAME" \
            release-assets/* \
            --verify-tag \
            --title "ScreenShotPP ${GITHUB_REF_NAME}" \
            --notes-file "$notes" \
            "${prerelease[@]}"
```

- [ ] **Step 3: Add the maintainer-only setup guide**

Create `docs/distribution/github-release.md`:

````markdown
# GitHub release setup

This guide configures the tag-driven ScreenShotPP GitHub release pipeline.

## 1. Apple Developer ID Application certificate

Create a **Developer ID Application** certificate from the Apple Developer portal:

<https://developer.apple.com/help/account/certificates/create-developer-id-certificates/>

Install the downloaded certificate in the macOS login keychain and verify it:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

Export the certificate and its private key from Keychain Access as
`DeveloperIDApplication.p12`.

## 2. App Store Connect API key

In App Store Connect, open **Users and Access** → **Integrations**, create a key with
Developer access, save its issuer ID and key ID, then download the `.p8` private key.
Apple allows the private key download only once.

Reference:
<https://v2.tauri.app/distribute/sign/macos/#app-store-connect>

## 3. GitHub Actions secrets

From a trusted local checkout, configure the encrypted repository secrets:

```bash
base64 -i DeveloperIDApplication.p12 | gh secret set APPLE_CERTIFICATE
gh secret set APPLE_CERTIFICATE_PASSWORD
gh secret set KEYCHAIN_PASSWORD
gh secret set APPLE_API_ISSUER
gh secret set APPLE_API_KEY
read -r -p "Path to the downloaded App Store Connect .p8 key: " api_key_path
gh secret set APPLE_API_PRIVATE_KEY < "$api_key_path"
```

Use a generated random value for `KEYCHAIN_PASSWORD`; it protects only the temporary CI
keychain.

Verify configured secret names without exposing their values:

```bash
gh secret list
```

## 4. Private release candidate

Keep the repository private. Create release notes for the candidate tag by copying the
final notes:

```bash
cp .github/release-notes/v0.1.0.md .github/release-notes/v0.1.0-rc.1.md
git add .github/release-notes/v0.1.0-rc.1.md
git commit -m "Prepare private v0.1.0 release candidate notes"
git push origin master
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

The `-rc.1` suffix makes the generated GitHub Release a prerelease. Download both assets
from the private release and verify:

- the macOS DMG installs, launches and completes a capture;
- `xcrun stapler validate ScreenShotPP_0.1.0_aarch64.dmg` succeeds;
- the Windows NSIS installer installs, launches and completes a capture.

## 5. Public v0.1.0

Only after the private RC passes:

```bash
gh repo edit xVc323/ScreenShotPP \
  --description "A fast, native screenshot tool for macOS and Windows." \
  --add-topic screenshot \
  --add-topic screen-capture \
  --add-topic annotation \
  --add-topic ocr \
  --add-topic tauri \
  --add-topic rust \
  --add-topic macos \
  --add-topic windows \
  --add-topic open-source

gh repo edit xVc323/ScreenShotPP \
  --visibility public \
  --accept-visibility-change-consequences

git tag v0.1.0
git push origin v0.1.0
```

Verify:

```bash
gh repo view xVc323/ScreenShotPP \
  --json isPrivate,description,repositoryTopics,url
gh release view v0.1.0 --repo xVc323/ScreenShotPP
```

## 6. Windows signing follow-up

After the repository and release are public, apply to SignPath Foundation:

<https://signpath.org/>

Integrate signed Windows installers in a future `v0.1.1`.
````

- [ ] **Step 4: Run the readiness check**

Run:

```bash
scripts/check-release-readiness.sh
```

Expected:

```text
release readiness: OK (v0.1.0, GIF ... bytes)
```

- [ ] **Step 5: Run existing checks**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
node --test src/accelerator.test.js src/editable-target.test.js src/editor/history.test.js src/editor/color.test.js src/editor/bubbles.test.js src/editor/editor.test.js src/editor/mosaic.test.js
git diff --check
```

Expected:
- Rust: all library tests pass;
- Node: all frontend tests pass;
- `git diff --check`: no output.

- [ ] **Step 6: Commit**

```bash
git add \
  .github/workflows/ci.yml \
  .github/workflows/release.yml \
  .github/release-notes/v0.1.0.md \
  docs/distribution/github-release.md \
  scripts/check-release-readiness.sh

git commit \
  -m "Publish complete release assets only after both platforms build" \
  -m "Constraint: A tag must never expose an incomplete GitHub release." \
  -m "Rejected: Upload directly from each matrix job | A failed platform could leave a partial public release." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Directive: Add matching release notes before pushing every release tag." \
  -m "Tested: release readiness guard; Rust tests; frontend tests; git diff --check" \
  -m "Not-tested: Apple notarization and Windows runner paths require the private RC workflow."
```

---

## Task 5: Configure Apple credentials in GitHub

**Files:**
- No repository file changes

This is credential-gated. Execute only from a trusted machine after the maintainer has
created and downloaded the Apple materials.

- [ ] **Step 1: Create and install the Developer ID Application certificate**

Follow the Apple certificate portal flow from:

```text
https://developer.apple.com/help/account/certificates/create-developer-id-certificates/
```

Verify locally:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

Expected: one valid `Developer ID Application: ...` identity.

- [ ] **Step 2: Export the certificate**

From Keychain Access:

1. open **My Certificates**;
2. expand the Developer ID Application certificate;
3. select the certificate and private key;
4. export as `DeveloperIDApplication.p12`;
5. protect it with a strong password.

- [ ] **Step 3: Create the App Store Connect API key**

From App Store Connect:

1. open **Users and Access**;
2. open **Integrations**;
3. create a key with Developer access;
4. record the issuer ID and key ID;
5. download the `.p8` private key once.

- [ ] **Step 4: Set encrypted GitHub Actions secrets**

Run from a trusted checkout:

```bash
base64 -i DeveloperIDApplication.p12 | gh secret set APPLE_CERTIFICATE
gh secret set APPLE_CERTIFICATE_PASSWORD
gh secret set KEYCHAIN_PASSWORD
gh secret set APPLE_API_ISSUER
gh secret set APPLE_API_KEY
read -r -p "Path to the downloaded App Store Connect .p8 key: " api_key_path
gh secret set APPLE_API_PRIVATE_KEY < "$api_key_path"
```

Enter values only in the interactive prompts. Do not paste secret values into shell
history, chat, Markdown, or Git.

- [ ] **Step 5: Verify secret names**

Run:

```bash
gh secret list
```

Expected names:

```text
APPLE_API_ISSUER
APPLE_API_KEY
APPLE_API_PRIVATE_KEY
APPLE_CERTIFICATE
APPLE_CERTIFICATE_PASSWORD
KEYCHAIN_PASSWORD
```

---

## Task 6: Push the preparation branch and validate a private RC

**Files:**
- Create: `.github/release-notes/v0.1.0-rc.1.md`

This task changes remote GitHub state. Execute only after the maintainer approves the
push and tag.

- [ ] **Step 1: Create release-candidate notes**

Run:

```bash
cp .github/release-notes/v0.1.0.md .github/release-notes/v0.1.0-rc.1.md
git add .github/release-notes/v0.1.0-rc.1.md
git commit \
  -m "Prepare private v0.1.0 release candidate notes" \
  -m "Constraint: Validate signing, notarization, and both installer paths before exposing the repository." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: release readiness guard" \
  -m "Not-tested: Remote workflow runs after push."
```

- [ ] **Step 2: Push `master` and the private RC tag**

Run:

```bash
scripts/check-release-readiness.sh
git push origin master
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

- [ ] **Step 3: Watch the release workflow**

Run:

```bash
gh run list --workflow Release --limit 3
gh run watch "$(gh run list --workflow Release --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: `build-macos`, `build-windows`, and `publish-release` succeed.

- [ ] **Step 4: Inspect the private prerelease**

Run:

```bash
gh release view v0.1.0-rc.1 --repo xVc323/ScreenShotPP
```

Expected:
- prerelease status;
- one `.dmg`;
- one `-setup.exe`.

- [ ] **Step 5: Download and validate the macOS DMG**

Run:

```bash
rm -rf /tmp/screenshotpp-rc
mkdir -p /tmp/screenshotpp-rc
gh release download v0.1.0-rc.1 \
  --repo xVc323/ScreenShotPP \
  --pattern '*.dmg' \
  --dir /tmp/screenshotpp-rc
xcrun stapler validate /tmp/screenshotpp-rc/*.dmg
spctl -a -vv -t install /tmp/screenshotpp-rc/*.dmg
```

Expected:
- stapler validation succeeds;
- Gatekeeper assessment succeeds.

Open the DMG, copy the app to `Applications`, launch it, grant Screen Recording
permission if required, and complete one capture.

- [ ] **Step 6: Validate the Windows installer**

Download the NSIS installer on a Windows machine:

```powershell
gh release download v0.1.0-rc.1 `
  --repo xVc323/ScreenShotPP `
  --pattern "*-setup.exe" `
  --dir "$env:TEMP\screenshotpp-rc"
```

Install it, verify the expected SmartScreen warning for the unsigned preview, launch
ScreenShotPP, and complete one capture.

---

## Task 7: Configure the repository storefront and publish v0.1.0

**Files:**
- No repository file changes

This task makes the repository public and publishes the first production tag. It is an
external-production and visibility-changing action. Execute only after explicit
maintainer approval and a successful private RC.

- [ ] **Step 1: Verify local and remote prerequisites**

Run:

```bash
scripts/check-release-readiness.sh
git status --short --branch
gh run list --workflow Release --limit 3
gh release view v0.1.0-rc.1 --repo xVc323/ScreenShotPP
```

Expected:
- readiness guard succeeds;
- clean Git status;
- private RC workflow green;
- private RC contains DMG and NSIS assets.

- [ ] **Step 2: Configure GitHub repository metadata**

Run:

```bash
gh repo edit xVc323/ScreenShotPP \
  --description "A fast, native screenshot tool for macOS and Windows." \
  --add-topic screenshot \
  --add-topic screen-capture \
  --add-topic annotation \
  --add-topic ocr \
  --add-topic tauri \
  --add-topic rust \
  --add-topic macos \
  --add-topic windows \
  --add-topic open-source
```

- [ ] **Step 3: Make the repository public**

Run only after explicit maintainer confirmation:

```bash
gh repo edit xVc323/ScreenShotPP \
  --visibility public \
  --accept-visibility-change-consequences
```

- [ ] **Step 4: Push the production tag**

Run:

```bash
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 5: Watch publication**

Run:

```bash
gh run watch "$(gh run list --workflow Release --limit 1 --json databaseId --jq '.[0].databaseId')"
gh release view v0.1.0 --repo xVc323/ScreenShotPP
```

Expected:
- release workflow succeeds;
- public release contains the notarized `.dmg` and Windows NSIS `.exe`;
- README GIF renders from the public repository;
- GitHub detects the MIT license.

- [ ] **Step 6: Apply to SignPath Foundation**

Open:

```text
https://signpath.org/
```

Submit the now-public repository and release for open-source Windows signing. Track
integration as Palier 4d.1.1 / `v0.1.1`.

---

## Task 8: Record the release state

**Files:**
- Create: `docs/distribution/releases/v0.1.0.md`

- [ ] **Step 1: Add the release record**

Create `docs/distribution/releases/v0.1.0.md`:

```markdown
# ScreenShotPP v0.1.0

- GitHub Release: https://github.com/xVc323/ScreenShotPP/releases/tag/v0.1.0
- Repository visibility: public
- License: MIT

## Assets

- macOS: signed, notarized and stapled DMG
- Windows: unsigned NSIS preview installer

## Verification

- macOS DMG: downloaded from GitHub Release, Gatekeeper accepted, capture smoke-tested
- Windows NSIS: downloaded from GitHub Release, installed, capture smoke-tested
- README GIF: renders on the public repository page
- CI: green on macOS and Windows

## Follow-up

- Apply to SignPath Foundation and sign the Windows installer in v0.1.1
- Implement Palier 4d.2 for the Mac App Store
- Implement Palier 4d.3 for the Microsoft Store
```

- [ ] **Step 2: Commit and push the release record**

Run:

```bash
git add docs/distribution/releases/v0.1.0.md
git commit \
  -m "Record the first public GitHub distribution" \
  -m "Constraint: Future Store work needs a verified baseline for the free GitHub channel." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: public release assets; README rendering; macOS and Windows smoke tests" \
  -m "Not-tested: Windows signing remains the v0.1.1 follow-up."
git push origin master
```

---

## Verification summary

Before declaring Palier 4d.1 complete:

```bash
scripts/check-release-readiness.sh
cargo test --manifest-path src-tauri/Cargo.toml --lib
node --test src/accelerator.test.js src/editable-target.test.js src/editor/history.test.js src/editor/color.test.js src/editor/bubbles.test.js src/editor/editor.test.js src/editor/mosaic.test.js
git diff --check
git status --short --branch
gh repo view xVc323/ScreenShotPP --json isPrivate,description,repositoryTopics,url
gh release view v0.1.0 --repo xVc323/ScreenShotPP
```

Required evidence:

- repository is public;
- metadata and topics are present;
- MIT license detected;
- README and GIF render;
- release workflow green;
- public `v0.1.0` contains the notarized `.dmg` and unsigned NSIS preview `.exe`;
- macOS and Windows smoke tests completed;
- working tree clean;
- SignPath Foundation application submitted or explicitly recorded as the next action.
