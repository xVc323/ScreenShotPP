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
