# Palier 4b — OCR Windows — Implementation Plan

> Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** OCR Windows (Windows.Media.Ocr) derrière `ocr::recognize`, validé par compilation CI Windows.

Branche : `palier-4b-ocr-windows`.

> **Note de validation :** ce code ne compile que sur Windows. On valide en poussant et en
> regardant le job CI `windows-latest` ; on itère sur les erreurs de compilation. Le build
> macOS local doit rester intact (la dépendance `windows` est ciblée `cfg(windows)`).

---

## Task 1: dépendance Windows ciblée

**Files:** Modify `src-tauri/Cargo.toml`

- [ ] **Step 1:** ajouter en fin de fichier :
```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.58", features = [
    "Media_Ocr",
    "Graphics_Imaging",
    "Storage_Streams",
    "Globalization",
    "Foundation",
    "Win32_System_Com",
] }
```

- [ ] **Step 2 (macOS) :** `cargo build --manifest-path src-tauri/Cargo.toml` doit **toujours
  compiler** (la dépendance Windows est ignorée hors Windows). **commit.**

---

## Task 2: implémentation Windows dans `ocr.rs`

**Files:** Modify `src-tauri/src/ocr.rs`

- [ ] **Step 1:** remplacer le stub `#[cfg(not(target_os = "macos"))]` par : un `recognize`
  Windows + un stub pour les autres OS + le module `windows_impl`.
```rust
#[cfg(windows)]
pub fn recognize(img: &RgbaImage, lang: &str) -> Result<String, String> {
    let png = crate::storage::encode_image(img, crate::storage::SaveFormat::Png)?;
    windows_impl::recognize_png(&png, lang)
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
pub fn recognize(_img: &RgbaImage, _lang: &str) -> Result<String, String> {
    Err("OCR pas encore disponible sur cette plateforme".to_string())
}

#[cfg(windows)]
mod windows_impl {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    pub(super) fn recognize_png(png: &[u8], lang: &str) -> Result<String, String> {
        // Apartment COM (MTA) pour ce thread ; ignore "déjà initialisé".
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        let stream = InMemoryRandomAccessStream::new().map_err(err)?;
        let writer = DataWriter::CreateDataWriter(&stream).map_err(err)?;
        writer.WriteBytes(png).map_err(err)?;
        writer.StoreAsync().map_err(err)?.get().map_err(err)?;
        writer.FlushAsync().map_err(err)?.get().map_err(err)?;
        writer.DetachStream().ok();
        stream.Seek(0).map_err(err)?;

        let decoder = BitmapDecoder::CreateAsync(&stream).map_err(err)?.get().map_err(err)?;
        let decoded = decoder.GetSoftwareBitmapAsync().map_err(err)?.get().map_err(err)?;
        let bitmap = SoftwareBitmap::Convert(&decoded, BitmapPixelFormat::Bgra8, BitmapAlphaMode::Premultiplied)
            .map_err(err)?;

        let engine = create_engine(lang)?;
        let result = engine.RecognizeAsync(&bitmap).map_err(err)?.get().map_err(err)?;
        let text = result.Text().map_err(err)?;
        Ok(text.to_string())
    }

    fn create_engine(lang: &str) -> Result<OcrEngine, String> {
        if lang == "auto" {
            return OcrEngine::TryCreateFromUserProfileLanguages().map_err(err);
        }
        let language = Language::CreateLanguage(&HSTRING::from(lang)).map_err(err)?;
        match OcrEngine::TryCreateFromLanguage(&language) {
            Ok(engine) => Ok(engine),
            Err(_) => OcrEngine::TryCreateFromUserProfileLanguages().map_err(err),
        }
    }

    fn err<E: std::fmt::Display>(e: E) -> String {
        format!("OCR Windows: {e}")
    }
}
```

- [ ] **Step 2 (macOS) :** `cargo build` + `cargo test --lib` doivent rester verts (le code
  Windows est exclu). **commit.**

---

## Task 3: pousser et valider la compilation Windows en CI (itératif)

- [ ] **Step 1:** merge/préparer, pousser la branche (ou ouvrir une PR) pour déclencher la CI.
- [ ] **Step 2:** regarder le job **`test (windows-latest)`**. S'il échoue à la compilation
  (noms de méthodes/features `windows-rs`, signatures async, COM), **corriger** `ocr.rs` /
  les features Cargo et repousser. Répéter jusqu'au **vert**.
  - Pièges probables : noms exacts des méthodes WinRT (`CreateDataWriter` vs `new`),
    `IAsyncOperation::get()`, signature de `CoInitializeEx` (retour `HRESULT`), features
    manquantes (ajouter au besoin, ex. `Storage_Streams`, `Foundation`).
- [ ] **Step 3:** une fois macOS + Windows verts → fusion finale.

## Critère d'acceptation
CI macOS + Windows vertes (le code OCR Windows compile ; macOS inchangé).

## Reporté
Test fonctionnel sur vraie machine Windows ; message utilisateur si pack de langue manquant.
