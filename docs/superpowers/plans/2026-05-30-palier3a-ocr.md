# Palier 3a — OCR (Apple Vision) — Implementation Plan

> Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** OCR d'une zone via Apple Vision (macOS) ponté par swift-rs, avec panneau d'aperçu et copie texte.

**Stratégie :** valider le pont swift-rs avec une fonction triviale AVANT d'ajouter Vision.

**Base :** capture pleine résolution dans `CaptureState` ; `capture::crop_region` + `capture::Rect` (Deserialize) conservés ; plugin clipboard déjà présent.

Branche : `palier-3a-ocr`.

---

## Task 1: Pont swift-rs — fonction triviale (dérisquage)

**Files:** Create `src-tauri/swift-lib/Package.swift`, `src-tauri/swift-lib/Sources/swift-lib/lib.swift`; Modify `src-tauri/Cargo.toml`, `src-tauri/build.rs`, create `src-tauri/src/ocr.rs`, modify `src-tauri/src/lib.rs`.

- [ ] **Step 1: deps** dans `src-tauri/Cargo.toml` :
```toml
[dependencies]
swift-rs = "1.0.7"

[build-dependencies]
swift-rs = { version = "1.0.7", features = ["build"] }
```
(`tauri-build` est déjà en build-dependencies — garder.)

- [ ] **Step 2: paquet Swift** `src-tauri/swift-lib/Package.swift` :
```swift
// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "swift-lib",
    platforms: [.macOS(.v11)],
    products: [
        .library(name: "swift-lib", type: .static, targets: ["swift-lib"]),
    ],
    dependencies: [
        .package(url: "https://github.com/Brendonovich/swift-rs", from: "1.0.6"),
    ],
    targets: [
        .target(
            name: "swift-lib",
            dependencies: [.product(name: "SwiftRs", package: "swift-rs")]
        ),
    ]
)
```
`src-tauri/swift-lib/Sources/swift-lib/lib.swift` (trivial d'abord) :
```swift
import SwiftRs
import Foundation

@_cdecl("ocr_recognize")
public func ocr_recognize(_ data: SRData) -> SRString {
    return SRString("BRIDGE_OK \(data.toArray().count) bytes")
}
```

- [ ] **Step 3: `build.rs`** — remplacer par :
```rust
fn main() {
    #[cfg(target_os = "macos")]
    {
        use swift_rs::SwiftLinker;
        SwiftLinker::new("11.0")
            .with_package("swift-lib", "./swift-lib/")
            .link();
        println!("cargo:rustc-link-lib=framework=Vision");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=ImageIO");
    }
    tauri_build::build();
}
```

- [ ] **Step 4: `src-tauri/src/ocr.rs`** :
```rust
use image::RgbaImage;

#[cfg(target_os = "macos")]
mod mac {
    use swift_rs::{swift, SRData, SRString};
    swift!(pub(crate) fn ocr_recognize(data: SRData) -> SRString);
}

/// Reconnaît le texte d'une image. macOS : Apple Vision. Ailleurs : pas encore dispo.
#[cfg(target_os = "macos")]
pub fn recognize(img: &RgbaImage) -> Result<String, String> {
    use swift_rs::SRData;
    let png = crate::storage::encode_image(img, crate::storage::SaveFormat::Png)?;
    let data = SRData::from(png.as_slice());
    let result = unsafe { mac::ocr_recognize(data) };
    Ok(result.to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn recognize(_img: &RgbaImage) -> Result<String, String> {
    Err("OCR pas encore disponible sur cette plateforme".to_string())
}
```

- [ ] **Step 5: déclarer** `mod ocr;` dans `src-tauri/src/lib.rs`.

- [ ] **Step 6: build macOS** :
```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -25
```
Expected: compile (le Swift se compile/linke). Adapter si l'API swift-rs diffère :
- `SRData::from(&[u8])` / `data.toArray()` : si la conversion diffère, consulter
  https://github.com/Brendonovich/swift-rs (ex. `SRData` depuis `Vec<u8>`, ou `.as_slice()`).
- `swift!` macro et `SwiftLinker::with_package(name, path)` : adapter aux signatures de la
  version 1.0.7. Le but : que `recognize` renvoie la chaîne « BRIDGE_OK … ».

- [ ] **Step 7: commit** (`feat: swift-rs bridge skeleton for OCR (trivial function)`).

---

## Task 2: Vision dans le Swift

**Files:** Modify `src-tauri/swift-lib/Sources/swift-lib/lib.swift`

- [ ] **Step 1:** remplacer `lib.swift` par la vraie reconnaissance :
```swift
import SwiftRs
import Foundation
import Vision
import CoreGraphics
import ImageIO

@_cdecl("ocr_recognize")
public func ocr_recognize(_ data: SRData) -> SRString {
    let cfData = Data(data.toArray()) as CFData
    guard let source = CGImageSourceCreateWithData(cfData, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        return SRString("")
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if #available(macOS 13.0, *) {
        request.automaticallyDetectsLanguage = true
    }
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return SRString("")
    }
    let lines: [String] = (request.results ?? []).compactMap { observation in
        observation.topCandidates(1).first?.string
    }
    return SRString(lines.joined(separator: "\n"))
}
```

- [ ] **Step 2: build** ; corriger les éventuels écarts d'API Vision (consulter la doc
Apple `VNRecognizeTextRequest`). **commit** (`feat: Apple Vision text recognition in Swift`).

---

## Task 3: commandes Rust `ocr_region` + `copy_text`

**Files:** Modify `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`

- [ ] **Step 1:** dans `commands.rs`, ajouter :
```rust
#[tauri::command]
pub fn ocr_region(app: AppHandle, rect: capture::Rect) -> Result<String, String> {
    let state = app.state::<CaptureState>();
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let img = guard.as_ref().ok_or("Aucune capture en cours")?;
    let cropped = capture::crop_region(img, rect);
    crate::ocr::recognize(&cropped)
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}
```
(`capture::Rect` est `Deserialize` ; `capture` est déjà importé.)

- [ ] **Step 2:** `lib.rs` invoke_handler : ajouter `commands::ocr_region, commands::copy_text,`.

- [ ] **Step 3:** `capabilities/default.json` : ajouter `"clipboard-manager:allow-write-text"` aux permissions.

- [ ] **Step 4: build** ; **commit** (`feat: ocr_region and copy_text commands`).

---

## Task 4: frontend — bouton OCR + panneau d'aperçu

**Files:** Modify `src/editor/editor.js`, `src/overlay.html`, `src/overlay.css`, `src/overlay.js`

- [ ] **Step 1: `editor.js`** — exposer le rectangle physique de la sélection dans l'objet retourné :
```js
    selectionPhysicalRect() {
      if (!selection) return null;
      const s = positiveNumber(o.scale, 1);
      return {
        x: Math.round(selection.x * s),
        y: Math.round(selection.y * s),
        width: Math.round(selection.width * s),
        height: Math.round(selection.height * s),
      };
    },
```

- [ ] **Step 2: `overlay.html`** — bouton OCR (avant Copy) et panneau d'aperçu (fin du `<body>`) :
```html
      <button id="ocr-btn">OCR</button>
```
```html
    <div id="ocr-panel" class="ocr-panel" hidden>
      <textarea id="ocr-text" spellcheck="false"></textarea>
      <div class="ocr-actions">
        <button id="ocr-copy">Copy text</button>
        <button id="ocr-close">Close</button>
      </div>
    </div>
```

- [ ] **Step 3: `overlay.css`** :
```css
.ocr-panel {
  position: fixed; z-index: 40; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 420px; max-width: 80vw; padding: 12px; display: flex; flex-direction: column; gap: 10px;
  background: #161b22; border: 1px solid #30363d; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.6);
}
.ocr-panel[hidden] { display: none; }
.ocr-panel textarea {
  width: 100%; height: 220px; resize: vertical; background: #0d1117; color: #e6edf3;
  border: 1px solid #30363d; border-radius: 6px; padding: 8px; font: 13px ui-monospace, monospace;
}
.ocr-actions { display: flex; gap: 8px; justify-content: flex-end; }
.ocr-actions button {
  background: #21262d; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px;
  height: 30px; padding: 0 12px; cursor: pointer;
}
```

- [ ] **Step 4: `overlay.js`** — câblage :
```js
const ocrBtn = document.getElementById("ocr-btn");
const ocrPanel = document.getElementById("ocr-panel");
const ocrText = document.getElementById("ocr-text");

ocrBtn.addEventListener("click", async () => {
  if (busy || !editor?.hasSelection()) return;
  const rect = editor.selectionPhysicalRect();
  if (!rect) return;
  setBusy(true);
  ocrBtn.textContent = "OCR…";
  try {
    const text = await invoke("ocr_region", { rect });
    ocrText.value = text || "";
    ocrPanel.hidden = false;
    ocrText.focus();
  } catch (error) {
    console.error("OCR failed:", error);
    window.alert("OCR failed: " + error);
  } finally {
    setBusy(false);
    ocrBtn.textContent = "OCR";
  }
});
document.getElementById("ocr-close").addEventListener("click", () => { ocrPanel.hidden = true; });
document.getElementById("ocr-copy").addEventListener("click", async () => {
  try {
    await invoke("copy_text", { text: ocrText.value });
    ocrPanel.hidden = true;
    await invoke("cancel_capture");
  } catch (error) {
    console.error("Copy text failed:", error);
    window.alert("Copy text failed: " + error);
  }
});
```
(`setBusy`/`busy`/`invoke`/`editor` existent déjà dans overlay.js.)

- [ ] **Step 5:** `node --check src/overlay.js src/editor/editor.js` ; **commit** (`feat: OCR button and preview panel`).

---

## Task 5: build release + vérification GUI (macOS)
- [ ] `npm run tauri build` ; lancer la `.app` ; **⌘⇧2**, sélectionner une zone de **texte**,
  cliquer **OCR** → le texte reconnu apparaît dans le panneau ; **Copy text** → coller
  ailleurs pour vérifier. Tester FR et EN. Corriger au besoin (débogage méthodique).

## Critère d'acceptation
Voir `docs/superpowers/specs/2026-05-30-palier3a-ocr-design.md` §8.

## Reporté
OCR Windows, sélecteur de langue (Palier 4), mosaïque (3b).
