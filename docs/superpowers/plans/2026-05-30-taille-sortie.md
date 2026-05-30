# Taille de sortie (compression) — Implementation Plan

> Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sélecteur « taille de sortie » (Full / ≤5/2/1 Mo) dans la barre, appliqué à Copier (downscale) et Enregistrer (JPEG), mémorisé.

**Tech:** Rust `image` (resize, JPEG), commandes étendues d'un `target`, frontend `<select>` + localStorage.

Branche : `feat-taille-sortie`.

---

## Task 1: Rust — fonctions de réduction (TDD)

**Files:** Modify `src-tauri/src/storage.rs`

- [ ] **Step 1: tests** dans le `#[cfg(test)] mod tests` :
```rust
    fn busy_image(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_fn(w, h, |x, y| {
            image::Rgba([((x * 7) % 256) as u8, ((y * 13) % 256) as u8, (((x + y) * 17) % 256) as u8, 255])
        })
    }

    #[test]
    fn target_max_bytes_mapping() {
        assert_eq!(target_max_bytes("full"), None);
        assert_eq!(target_max_bytes("1mb"), Some(1_000_000));
        assert_eq!(target_max_bytes("2mb"), Some(2_000_000));
        assert_eq!(target_max_bytes("5mb"), Some(5_000_000));
    }

    #[test]
    fn jpeg_quality_encodes_jpeg() {
        let img = busy_image(32, 32);
        let bytes = encode_jpeg_quality(&img, 60).unwrap();
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8]);
    }

    #[test]
    fn downscale_fits_under_target() {
        let img = busy_image(1200, 1200); // PNG volumineux (haute entropie)
        let out = fit_by_downscale(&img, 200_000).unwrap();
        let png = encode_image(&out, SaveFormat::Png).unwrap();
        assert!(png.len() <= 200_000, "png={} > cible", png.len());
        assert!(out.width() < 1200);
    }

    #[test]
    fn jpeg_fit_under_target() {
        let img = busy_image(1200, 1200);
        let bytes = fit_by_jpeg_quality(&img, 150_000).unwrap();
        assert!(bytes.len() <= 150_000, "jpeg={} > cible", bytes.len());
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8]);
    }
```

- [ ] **Step 2: lancer → échec** (`cargo test --manifest-path src-tauri/Cargo.toml storage::`).

- [ ] **Step 3: implémenter** dans `storage.rs` :
```rust
/// Cible textuelle → octets max (None = pleine qualité).
pub fn target_max_bytes(target: &str) -> Option<usize> {
    match target {
        "1mb" => Some(1_000_000),
        "2mb" => Some(2_000_000),
        "5mb" => Some(5_000_000),
        _ => None,
    }
}

/// JPEG à une qualité donnée (0-100).
pub fn encode_jpeg_quality(img: &RgbaImage, quality: u8) -> Result<Vec<u8>, String> {
    use image::codecs::jpeg::JpegEncoder;
    let rgb = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
    let mut buf = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, quality)
        .encode(rgb.as_raw(), rgb.width(), rgb.height(), ExtendedColorType::Rgb8)
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

/// Réduit la résolution jusqu'à ce que le PNG tienne sous `max_bytes` (pour le presse-papier).
pub fn fit_by_downscale(img: &RgbaImage, max_bytes: usize) -> Result<RgbaImage, String> {
    let mut current = img.clone();
    loop {
        let png = encode_image(&current, SaveFormat::Png)?;
        if png.len() <= max_bytes || current.width() <= 32 || current.height() <= 32 {
            return Ok(current);
        }
        let nw = ((current.width() as f32) * 0.85) as u32;
        let nh = ((current.height() as f32) * 0.85) as u32;
        current = image::imageops::resize(&current, nw.max(1), nh.max(1), image::imageops::FilterType::Lanczos3);
    }
}

/// JPEG à la meilleure qualité qui tient sous `max_bytes`, downscale si nécessaire.
pub fn fit_by_jpeg_quality(img: &RgbaImage, max_bytes: usize) -> Result<Vec<u8>, String> {
    let mut work = img.clone();
    loop {
        for q in [92u8, 85, 78, 70, 62, 54, 46, 38, 30, 22] {
            let bytes = encode_jpeg_quality(&work, q)?;
            if bytes.len() <= max_bytes {
                return Ok(bytes);
            }
        }
        if work.width() <= 32 || work.height() <= 32 {
            return encode_jpeg_quality(&work, 22);
        }
        let nw = ((work.width() as f32) * 0.8) as u32;
        let nh = ((work.height() as f32) * 0.8) as u32;
        work = image::imageops::resize(&work, nw.max(1), nh.max(1), image::imageops::FilterType::Lanczos3);
    }
}
```
(`ExtendedColorType` est déjà importé en haut de `storage.rs`.)

- [ ] **Step 4: lancer → succès** ; **commit**.

---

## Task 2: Rust — paramètre `target` dans les commandes

**Files:** Modify `src-tauri/src/commands.rs`

- [ ] **Step 1:** `copy_composited` reçoit `target: String` ; après décodage en `img` :
```rust
    match storage::target_max_bytes(&target) {
        Some(n) => {
            let reduced = storage::fit_by_downscale(&img, n)?;
            clipboard::copy_image(&app, &reduced)?;
        }
        None => clipboard::copy_image(&app, &img)?,
    }
```
- [ ] **Step 2:** `save_composited` reçoit `target: String` ; après décodage :
```rust
    let out = match storage::target_max_bytes(&target) {
        Some(n) => storage::fit_by_jpeg_quality(&img, n)?,
        None => {
            let fmt = storage::SaveFormat::from_str(&format);
            storage::encode_image(&img, fmt)?
        }
    };
    storage::write_to_disk(&path, &out)?;
```
- [ ] **Step 3:** `cargo build` ; **commit**.

---

## Task 3: Frontend — sélecteur de taille

**Files:** Modify `src/overlay.html`, `src/overlay.css`, `src/overlay.js`

- [ ] **Step 1: `overlay.html`** — avant `#copy-btn`, ajouter :
```html
      <select id="output-size" title="Output size">
        <option value="full">Full</option>
        <option value="5mb">≤5MB</option>
        <option value="2mb">≤2MB</option>
        <option value="1mb">≤1MB</option>
      </select>
```
- [ ] **Step 2: `overlay.css`** — `.toolbar #output-size { width: 76px; }` (réutilise le style select de base).
- [ ] **Step 3: `overlay.js`** :
  - réf + persistance :
```js
const outputSize = document.getElementById("output-size");
const savedSize = localStorage.getItem("outputSize");
if (savedSize) outputSize.value = savedSize;
outputSize.addEventListener("change", () => localStorage.setItem("outputSize", outputSize.value));
```
  - `doCopy` : `await invoke("copy_composited", { pngBase64: editor.exportPngBase64(), target: outputSize.value });`
  - `doSave` :
```js
    const target = outputSize.value;
    const suggested = await invoke("default_save_name", { format: target === "full" ? "png" : "jpeg" });
    const path = await dialog.save({ defaultPath: suggested, filters: [
      { name: "PNG", extensions: ["png"] },
      { name: "JPEG", extensions: ["jpg", "jpeg"] },
    ]});
    if (!path) return;
    const lower = path.toLowerCase();
    let finalPath = path;
    let format;
    if (target === "full") {
      format = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg" : "png";
    } else {
      format = "jpeg";
      if (!(lower.endsWith(".jpg") || lower.endsWith(".jpeg"))) finalPath = path + ".jpg";
    }
    await invoke("save_composited", { pngBase64: editor.exportPngBase64(), path: finalPath, format, target });
```
- [ ] **Step 4:** `node --check src/overlay.js` ; **commit**.

---

## Task 4: build release + vérification GUI
- [ ] `npm run tauri build`, lancer une `.app`, tester : copie ≤2 Mo puis coller (plus léger), enregistrer ≤1 Mo (`.jpg` sous la cible), Full inchangé. Corriger au besoin.

## Critère d'acceptation
Voir `docs/superpowers/specs/2026-05-30-taille-sortie-design.md` §6.
