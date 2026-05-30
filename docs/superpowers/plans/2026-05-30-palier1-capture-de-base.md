# Palier 1 — Boucle de capture de base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une app Tauri v2 qui tourne en arrière-plan (icône menu bar/tray, pas d'icône Dock/barre des tâches), déclenchée par un raccourci global, qui laisse sélectionner une zone de l'écran, puis la copier dans le presse-papier ou l'enregistrer en PNG/JPEG.

**Architecture:** Cœur Rust (capture via `xcap`, presse-papier/raccourci via plugins Tauri, encodage via crate `image`) + interface web (overlay plein écran affichant la capture gelée, sélection à la souris sur un canvas). La capture est prise au moment du raccourci, stockée en mémoire côté Rust, affichée dans une fenêtre overlay ; la zone choisie est recadrée côté Rust puis copiée/enregistrée.

**Tech Stack:** Tauri v2, Rust (crates : `xcap`, `image`, `serde`, `chrono`), plugins Tauri `global-shortcut` et `clipboard-manager`, frontend Vanilla JS + Vite, gestionnaire de paquets **npm**.

**Notes de périmètre Palier 1 :**
- Formats d'enregistrement : **PNG + JPEG** (WebP reporté à un palier ultérieur pour éviter les soucis d'encodeur).
- Capture ciblée sur le **moniteur principal** ; la sélection multi-moniteur complète est une amélioration notée pour plus tard.
- Pas encore d'outils d'annotation (Palier 2). L'overlay propose seulement **Copy** et **Save**.
- APIs Tauri v2 : en cas de dérive d'API, consulter https://v2.tauri.app — les étapes de vérification (build + run) attrapent ces écarts.

---

## Structure des fichiers

```
ScreenShotPP/
├── package.json                 # frontend (Vite)
├── index.html                   # fenêtre principale (réglages minimal, cachée au démarrage)
├── overlay.html                 # fenêtre overlay de sélection
├── src/
│   ├── main.js                  # logique fenêtre principale (placeholder Palier 1)
│   ├── overlay.js               # sélection de zone + boutons Copy/Save
│   └── styles.css               # styles overlay
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/                   # icônes générées par le scaffold
│   ├── capabilities/default.json
│   └── src/
│       ├── main.rs              # point d'entrée (appelle lib::run)
│       ├── lib.rs               # setup app, état, plugins, tray, policy, commands
│       ├── settings.rs          # préférences (sérialisation, défauts)
│       ├── storage.rs           # nom de fichier + encodage PNG/JPEG + écriture disque
│       ├── capture.rs           # capture moniteur + recadrage (crop)
│       ├── clipboard.rs         # copie image dans le presse-papier
│       ├── hotkey.rs            # enregistrement du raccourci global
│       ├── tray.rs              # icône tray/menu bar + menu
│       └── commands.rs          # commands Tauri exposées à l'interface
```

Chaque module Rust a une responsabilité unique. Les fonctions pures (nom de fichier,
encodage, recadrage, défauts de réglages) sont testées en unitaire ; l'intégration OS
(capture réelle, tray, raccourci, overlay) est vérifiée manuellement à chaque tâche.

---

## Task 1: Scaffold du projet Tauri v2 + lancement de l'app vierge

**Files:**
- Create: tout le squelette Tauri (généré par le CLI), `.gitignore`

- [ ] **Step 1: Initialiser le dépôt git**

Le dossier contient déjà `docs/` et `.superpowers/`. On versionne à partir de maintenant.

Run:
```bash
cd /Users/you/ScreenShotPP
git init
```
Expected: `Initialized empty Git repository ...`

- [ ] **Step 2: Scaffolder Tauri v2 dans un dossier temporaire puis fusionner**

`create-tauri-app` refuse un dossier non vide, donc on scaffolde à côté puis on déplace.

Run:
```bash
cd /Users/you
npm create tauri-app@latest sspp-scaffold -- --template vanilla --manager npm --yes
# Déplacer le contenu (y compris fichiers cachés) dans le projet, sans écraser docs/
rsync -a --exclude '.git' /Users/you/sspp-scaffold/ /Users/you/ScreenShotPP/
rm -rf /Users/you/sspp-scaffold
```
Expected: présence de `src-tauri/`, `index.html`, `package.json`, `src/main.js` dans
`/Users/you/ScreenShotPP`.

- [ ] **Step 3: Installer les dépendances frontend**

Run:
```bash
cd /Users/you/ScreenShotPP
npm install
```
Expected: `node_modules/` créé, pas d'erreur.

- [ ] **Step 4: Écrire le `.gitignore`**

Create `/Users/you/ScreenShotPP/.gitignore`:
```gitignore
# Dépendances & builds
node_modules/
dist/
src-tauri/target/

# Compagnon visuel brainstorming
.superpowers/

# OS
.DS_Store
```

- [ ] **Step 5: Lancer l'app en dev pour vérifier qu'elle démarre**

Run:
```bash
cd /Users/you/ScreenShotPP
npm run tauri dev
```
Expected: une fenêtre d'app Tauri vierge s'affiche. Fermer la fenêtre (Ctrl+C dans le
terminal pour arrêter le serveur dev). **Vérification manuelle : la fenêtre apparaît.**

- [ ] **Step 6: Commit**

```bash
cd /Users/you/ScreenShotPP
git add -A
git commit -m "chore: scaffold Tauri v2 project"
```

---

## Task 2: App en arrière-plan — policy accessory + icône tray avec menu Quit

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Cacher la fenêtre principale au démarrage**

Dans `src-tauri/tauri.conf.json`, repérer le tableau `app.windows[0]` et y ajouter
`"visible": false` ainsi qu'un label explicite. La section ressemblera à :
```json
{
  "label": "main",
  "title": "ScreenShotPP",
  "width": 800,
  "height": 600,
  "visible": false
}
```

- [ ] **Step 2: Écrire le module tray**

Create `src-tauri/src/tray.rs`:
```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, Manager,
};

/// Construit l'icône de tray/menu bar avec un menu minimal (Quit).
pub fn build_tray(app: &App) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "quit" {
                app.exit(0);
            }
        })
        .build(app)?;

    Ok(())
}
```

- [ ] **Step 3: Brancher tray + policy accessory dans `lib.rs`**

Dans `src-tauri/src/lib.rs`, déclarer le module et l'appeler dans `setup`. Remplacer le
contenu par :
```rust
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Pas d'icône dans le Dock macOS : politique "accessory".
            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Lancer et vérifier le comportement arrière-plan**

Run:
```bash
cd /Users/you/ScreenShotPP
npm run tauri dev
```
Expected (**vérification manuelle**) :
- Aucune fenêtre visible au démarrage.
- **macOS** : pas d'icône dans le Dock ; une icône apparaît dans la barre de menu en haut.
- Cliquer l'icône → menu avec **Quit** → Quit ferme l'app.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: background app with tray icon and quit menu"
```

---

## Task 3: Module settings (TDD)

**Files:**
- Create: `src-tauri/src/settings.rs`
- Modify: `src-tauri/Cargo.toml` (deps `serde`, `serde_json`)
- Modify: `src-tauri/src/lib.rs` (déclarer le module)

- [ ] **Step 1: Ajouter les dépendances**

Dans `src-tauri/Cargo.toml`, sous `[dependencies]`, ajouter :
```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Écrire le test qui échoue**

Create `src-tauri/src/settings.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    pub capture_shortcut: String,
    pub default_save_folder: String,
    pub default_format: String, // "png" | "jpeg"
    pub ocr_language: String,   // "auto" | code langue
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_have_expected_values() {
        let s = Settings::default();
        assert_eq!(s.capture_shortcut, "CmdOrCtrl+Shift+2");
        assert_eq!(s.default_format, "png");
        assert_eq!(s.ocr_language, "auto");
    }

    #[test]
    fn settings_roundtrip_through_json() {
        let s = Settings::default();
        let json = serde_json::to_string(&s).unwrap();
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }
}
```

- [ ] **Step 3: Lancer le test pour vérifier l'échec**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml settings:: 2>&1 | tail -20
```
Expected: échec de compilation — `Default` n'est pas implémenté pour `Settings`.

- [ ] **Step 4: Implémenter `Default`**

Ajouter dans `src-tauri/src/settings.rs`, avant le bloc `#[cfg(test)]` :
```rust
impl Default for Settings {
    fn default() -> Self {
        Settings {
            capture_shortcut: "CmdOrCtrl+Shift+2".to_string(),
            default_save_folder: String::new(), // résolu au runtime (Bureau)
            default_format: "png".to_string(),
            ocr_language: "auto".to_string(),
        }
    }
}
```

- [ ] **Step 5: Déclarer le module**

Dans `src-tauri/src/lib.rs`, ajouter en haut : `mod settings;`

- [ ] **Step 6: Lancer le test pour vérifier le succès**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml settings:: 2>&1 | tail -20
```
Expected: `test result: ok. 2 passed`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: settings module with defaults and json roundtrip"
```

---

## Task 4: Module storage — nom de fichier + encodage PNG/JPEG (TDD)

**Files:**
- Create: `src-tauri/src/storage.rs`
- Modify: `src-tauri/Cargo.toml` (deps `image`, `chrono`)
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Ajouter les dépendances**

Dans `src-tauri/Cargo.toml`, sous `[dependencies]` :
```toml
image = "0.25"
chrono = "0.4"
```

- [ ] **Step 2: Écrire les tests qui échouent**

Create `src-tauri/src/storage.rs`:
```rust
use chrono::{Local, NaiveDateTime};
use image::{ImageFormat, RgbaImage};
use std::io::Cursor;

/// Format d'image supporté au Palier 1.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SaveFormat {
    Png,
    Jpeg,
}

impl SaveFormat {
    pub fn from_str(s: &str) -> SaveFormat {
        match s {
            "jpeg" | "jpg" => SaveFormat::Jpeg,
            _ => SaveFormat::Png,
        }
    }
    pub fn extension(&self) -> &'static str {
        match self {
            SaveFormat::Png => "png",
            SaveFormat::Jpeg => "jpg",
        }
    }
}

/// Nom de fichier par défaut : "Capture 2026-05-30 a 14.32.png".
pub fn default_filename(now: NaiveDateTime, format: SaveFormat) -> String {
    format!(
        "Capture {} a {}.{}",
        now.format("%Y-%m-%d"),
        now.format("%H.%M"),
        format.extension()
    )
}

/// Nom basé sur l'heure locale courante.
pub fn current_filename(format: SaveFormat) -> String {
    default_filename(Local::now().naive_local(), format)
}

/// Encode une image RGBA dans le format demandé et renvoie les octets.
pub fn encode_image(img: &RgbaImage, format: SaveFormat) -> Result<Vec<u8>, String> {
    let mut buf = Cursor::new(Vec::new());
    match format {
        SaveFormat::Png => img
            .write_to(&mut buf, ImageFormat::Png)
            .map_err(|e| e.to_string())?,
        SaveFormat::Jpeg => {
            // JPEG ne gère pas l'alpha : on convertit en RGB.
            let rgb = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
            rgb.write_to(&mut buf, ImageFormat::Jpeg)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(buf.into_inner())
}

/// Écrit les octets encodés sur le disque.
pub fn write_to_disk(path: &str, bytes: &[u8]) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn filename_is_formatted_with_date_and_extension() {
        let dt = NaiveDate::from_ymd_opt(2026, 5, 30)
            .unwrap()
            .and_hms_opt(14, 32, 0)
            .unwrap();
        assert_eq!(
            default_filename(dt, SaveFormat::Png),
            "Capture 2026-05-30 a 14.32.png"
        );
        assert_eq!(
            default_filename(dt, SaveFormat::Jpeg),
            "Capture 2026-05-30 a 14.32.jpg"
        );
    }

    #[test]
    fn png_encoding_starts_with_png_magic_bytes() {
        let img = RgbaImage::new(4, 4);
        let bytes = encode_image(&img, SaveFormat::Png).unwrap();
        assert_eq!(&bytes[0..4], &[0x89, 0x50, 0x4E, 0x47]); // .PNG
    }

    #[test]
    fn jpeg_encoding_starts_with_jpeg_magic_bytes() {
        let img = RgbaImage::new(4, 4);
        let bytes = encode_image(&img, SaveFormat::Jpeg).unwrap();
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8]); // JPEG SOI
    }

    #[test]
    fn format_from_str_defaults_to_png() {
        assert_eq!(SaveFormat::from_str("webp"), SaveFormat::Png);
        assert_eq!(SaveFormat::from_str("jpg"), SaveFormat::Jpeg);
    }
}
```

- [ ] **Step 3: Lancer les tests pour vérifier l'échec**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml storage:: 2>&1 | tail -20
```
Expected: échec de compilation (module non déclaré) ou erreurs tant que `image`/`chrono`
ne sont pas résolus. Après `mod storage;` (étape suivante) ce sera un vrai run de test.

- [ ] **Step 4: Déclarer le module**

Dans `src-tauri/src/lib.rs`, ajouter : `mod storage;`

- [ ] **Step 5: Lancer les tests pour vérifier le succès**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml storage:: 2>&1 | tail -20
```
Expected: `test result: ok. 4 passed`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: storage module with filename and png/jpeg encoding"
```

---

## Task 5: Module capture — capture moniteur + recadrage (TDD sur le crop)

**Files:**
- Create: `src-tauri/src/capture.rs`
- Modify: `src-tauri/Cargo.toml` (dep `xcap`)
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Ajouter la dépendance**

Dans `src-tauri/Cargo.toml`, sous `[dependencies]` :
```toml
xcap = "0.0.14"
```

- [ ] **Step 2: Écrire le test de recadrage (pur, sans écran)**

Create `src-tauri/src/capture.rs`:
```rust
use image::RgbaImage;

/// Rectangle de sélection en pixels physiques de l'image capturée.
#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Recadre l'image source selon le rectangle, en bornant aux dimensions de l'image.
pub fn crop_region(src: &RgbaImage, rect: Rect) -> RgbaImage {
    let max_w = src.width().saturating_sub(rect.x);
    let max_h = src.height().saturating_sub(rect.y);
    let w = rect.width.min(max_w).max(1);
    let h = rect.height.min(max_h).max(1);
    image::imageops::crop_imm(src, rect.x, rect.y, w, h).to_image()
}

/// Capture le moniteur principal et renvoie son image RGBA.
/// (Intégration OS — non testée en unitaire, vérifiée manuellement.)
pub fn capture_primary_monitor() -> Result<RgbaImage, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .ok_or_else(|| "Aucun moniteur principal trouvé".to_string())?;
    monitor.capture_image().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid_image(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_pixel(w, h, image::Rgba([10, 20, 30, 255]))
    }

    #[test]
    fn crop_returns_requested_dimensions_when_in_bounds() {
        let src = solid_image(100, 100);
        let out = crop_region(&src, Rect { x: 10, y: 20, width: 30, height: 40 });
        assert_eq!(out.dimensions(), (30, 40));
    }

    #[test]
    fn crop_is_clamped_to_image_bounds() {
        let src = solid_image(100, 100);
        let out = crop_region(&src, Rect { x: 90, y: 90, width: 50, height: 50 });
        assert_eq!(out.dimensions(), (10, 10));
    }

    #[test]
    fn crop_never_returns_zero_sized_image() {
        let src = solid_image(100, 100);
        let out = crop_region(&src, Rect { x: 10, y: 10, width: 0, height: 0 });
        assert_eq!(out.dimensions(), (1, 1));
    }
}
```

- [ ] **Step 3: Lancer les tests pour vérifier l'échec**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml capture:: 2>&1 | tail -20
```
Expected: échec — module non déclaré.

- [ ] **Step 4: Déclarer le module**

Dans `src-tauri/src/lib.rs`, ajouter : `mod capture;`

- [ ] **Step 5: Lancer les tests pour vérifier le succès**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml capture:: 2>&1 | tail -20
```
Expected: `test result: ok. 3 passed`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: capture module with primary monitor capture and crop"
```

---

## Task 6: Module clipboard — copie image dans le presse-papier

**Files:**
- Create: `src-tauri/src/clipboard.rs`
- Modify: `src-tauri/Cargo.toml` (plugin clipboard)
- Modify: `src-tauri/src/lib.rs` (enregistrer le plugin)
- Modify: `src-tauri/capabilities/default.json` (permissions)

- [ ] **Step 1: Ajouter le plugin clipboard**

Run:
```bash
cd /Users/you/ScreenShotPP/src-tauri
cargo add tauri-plugin-clipboard-manager
```
Expected: ajout de `tauri-plugin-clipboard-manager` v2 dans `Cargo.toml`.

- [ ] **Step 2: Enregistrer le plugin**

Dans `src-tauri/src/lib.rs`, dans la chaîne `tauri::Builder::default()`, avant `.setup(`,
ajouter :
```rust
        .plugin(tauri_plugin_clipboard_manager::init())
```

- [ ] **Step 3: Autoriser la permission clipboard**

Dans `src-tauri/capabilities/default.json`, ajouter à la liste `permissions` :
```json
"clipboard-manager:allow-write-image"
```

- [ ] **Step 4: Écrire le module clipboard**

Create `src-tauri/src/clipboard.rs`:
```rust
use image::RgbaImage;
use tauri::image::Image;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Copie une image RGBA dans le presse-papier système.
pub fn copy_image(app: &tauri::AppHandle, img: &RgbaImage) -> Result<(), String> {
    let (w, h) = img.dimensions();
    let tauri_img = Image::new_owned(img.clone().into_raw(), w, h);
    app.clipboard()
        .write_image(&tauri_img)
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 5: Déclarer le module**

Dans `src-tauri/src/lib.rs`, ajouter : `mod clipboard;`

- [ ] **Step 6: Vérifier la compilation**

Run:
```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15
```
Expected: compilation réussie (warnings de code inutilisé acceptables à ce stade).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: clipboard module to copy image to system clipboard"
```

---

## Task 7: Raccourci global — déclenche une commande de capture

**Files:**
- Create: `src-tauri/src/hotkey.rs`
- Modify: `src-tauri/Cargo.toml` (plugin global-shortcut)
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Ajouter le plugin global-shortcut**

Run:
```bash
cd /Users/you/ScreenShotPP/src-tauri
cargo add tauri-plugin-global-shortcut
```

- [ ] **Step 2: Écrire le module hotkey**

Create `src-tauri/src/hotkey.rs`:
```rust
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Enregistre le raccourci global ; à chaque appui (pressed), lance la capture.
pub fn register_capture_shortcut(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcut = accelerator.to_string();
    app.global_shortcut()
        .on_shortcut(accelerator, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let app = app.clone();
                // Lancer le flux de capture sans bloquer le callback.
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::commands::start_capture(app.clone()).await {
                        eprintln!("Capture échouée: {e}");
                    }
                });
            }
        })
        .map_err(|e| format!("Échec d'enregistrement du raccourci {shortcut}: {e}"))?;
    Ok(())
}
```

- [ ] **Step 3: Enregistrer le plugin + le raccourci dans `lib.rs`**

Dans `src-tauri/src/lib.rs` : ajouter `mod hotkey;`, enregistrer le plugin dans le builder
(avant `.setup(`) :
```rust
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
```
et dans `setup`, après `tray::build_tray(app)?;`, ajouter :
```rust
            let settings = settings::Settings::default();
            hotkey::register_capture_shortcut(&app.handle(), &settings.capture_shortcut)?;
```
Note : `commands::start_capture` est créé à la Task 8 ; tant qu'il n'existe pas, ce code
ne compile pas. On finalise la compilation à la Task 8.

- [ ] **Step 4: Commit (work in progress, compile à la Task 8)**

```bash
git add -A
git commit -m "feat: register global capture shortcut (wiring completed in next task)"
```

---

## Task 8: Commands + overlay — flux complet de capture

**Files:**
- Create: `src-tauri/src/commands.rs`
- Create: `overlay.html`, `src/overlay.js`, `src/styles.css`
- Modify: `src-tauri/src/lib.rs` (état partagé, handler de commands)
- Modify: `src-tauri/tauri.conf.json` (déclarer overlay si nécessaire)
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Écrire le module commands (état + commands)**

Create `src-tauri/src/commands.rs`:
```rust
use crate::{capture, clipboard, storage};
use crate::capture::Rect;
use base64::Engine;
use image::RgbaImage;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Capture courante gelée, partagée entre commands.
#[derive(Default)]
pub struct CaptureState(pub Mutex<Option<RgbaImage>>);

/// Déclenché par le raccourci : capture l'écran et ouvre l'overlay.
pub async fn start_capture(app: AppHandle) -> Result<(), String> {
    let img = capture::capture_primary_monitor()?;
    {
        let state = app.state::<CaptureState>();
        *state.0.lock().unwrap() = Some(img);
    }
    // Fermer un éventuel overlay précédent.
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.close();
    }
    WebviewWindowBuilder::new(&app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("ScreenShotPP Overlay")
        .fullscreen(true)
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// L'overlay récupère la capture gelée en PNG (data URL base64) pour l'afficher.
#[tauri::command]
pub fn get_capture_data_url(app: AppHandle) -> Result<String, String> {
    let state = app.state::<CaptureState>();
    let guard = state.0.lock().unwrap();
    let img = guard.as_ref().ok_or("Aucune capture en cours")?;
    let png = storage::encode_image(img, storage::SaveFormat::Png)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(png);
    Ok(format!("data:image/png;base64,{b64}"))
}

/// Recadre selon le rectangle (pixels physiques) et copie dans le presse-papier.
#[tauri::command]
pub fn copy_selection(app: AppHandle, rect: Rect) -> Result<(), String> {
    let cropped = with_cropped(&app, rect)?;
    clipboard::copy_image(&app, &cropped)?;
    close_overlay(&app);
    Ok(())
}

/// Recadre et écrit sur disque au chemin/format donnés.
#[tauri::command]
pub fn save_selection(
    app: AppHandle,
    rect: Rect,
    path: String,
    format: String,
) -> Result<(), String> {
    let cropped = with_cropped(&app, rect)?;
    let fmt = storage::SaveFormat::from_str(&format);
    let bytes = storage::encode_image(&cropped, fmt)?;
    storage::write_to_disk(&path, &bytes)?;
    close_overlay(&app);
    Ok(())
}

/// Nom de fichier par défaut proposé à la fenêtre d'enregistrement.
#[tauri::command]
pub fn default_save_name(format: String) -> String {
    storage::current_filename(storage::SaveFormat::from_str(&format))
}

/// Ferme l'overlay (annulation depuis l'interface).
#[tauri::command]
pub fn cancel_capture(app: AppHandle) {
    close_overlay(&app);
}

fn with_cropped(app: &AppHandle, rect: Rect) -> Result<RgbaImage, String> {
    let state = app.state::<CaptureState>();
    let guard = state.0.lock().unwrap();
    let img = guard.as_ref().ok_or("Aucune capture en cours")?;
    Ok(capture::crop_region(img, rect))
}

fn close_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.close();
    }
}
```

- [ ] **Step 2: Rendre `Rect` désérialisable depuis l'interface**

Dans `src-tauri/src/capture.rs`, modifier l'attribut dérivé de `Rect` pour inclure serde :
```rust
#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}
```

- [ ] **Step 3: Ajouter les dépendances `base64`**

Run:
```bash
cd /Users/you/ScreenShotPP/src-tauri
cargo add base64
```

- [ ] **Step 4: Brancher l'état et le handler de commands dans `lib.rs`**

Le `src-tauri/src/lib.rs` final doit ressembler à :
```rust
mod tray;
mod settings;
mod storage;
mod capture;
mod clipboard;
mod hotkey;
mod commands;

use commands::CaptureState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(CaptureState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_capture_data_url,
            commands::copy_selection,
            commands::save_selection,
            commands::default_save_name,
            commands::cancel_capture,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::build_tray(app)?;

            let settings = settings::Settings::default();
            hotkey::register_capture_shortcut(&app.handle(), &settings.capture_shortcut)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Autoriser le plugin dialog pour la fenêtre d'enregistrement**

Run:
```bash
cd /Users/you/ScreenShotPP/src-tauri
cargo add tauri-plugin-dialog
```
Dans `lib.rs`, ajouter le plugin (avant `.manage`) :
```rust
        .plugin(tauri_plugin_dialog::init())
```
Dans `src-tauri/capabilities/default.json`, ajouter aux `permissions` :
```json
"dialog:allow-save",
"core:webview:allow-create-webview-window",
"core:window:allow-close"
```

- [ ] **Step 6: Écrire l'overlay HTML**

Create `/Users/you/ScreenShotPP/overlay.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Capture</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body class="overlay-body">
    <img id="shot" alt="" />
    <canvas id="dim"></canvas>
    <div id="toolbar" class="toolbar hidden">
      <button id="copy-btn">Copy</button>
      <button id="save-btn">Save</button>
      <button id="cancel-btn">Cancel</button>
    </div>
    <script type="module" src="/src/overlay.js"></script>
  </body>
</html>
```

- [ ] **Step 7: Écrire les styles de l'overlay**

Create `/Users/you/ScreenShotPP/src/styles.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
.overlay-body { overflow: hidden; cursor: crosshair; user-select: none; }
#shot { position: fixed; inset: 0; width: 100vw; height: 100vh; object-fit: fill; }
#dim { position: fixed; inset: 0; width: 100vw; height: 100vh; }
.toolbar {
  position: fixed; display: flex; gap: 6px; padding: 6px;
  background: #161b22; border: 1px solid #30363d; border-radius: 8px;
  z-index: 10;
}
.toolbar.hidden { display: none; }
.toolbar button {
  background: #21262d; color: #e6edf3; border: 1px solid #30363d;
  border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;
}
.toolbar button:hover { background: #30363d; }
```

- [ ] **Step 8: Écrire la logique de sélection de l'overlay**

Create `/Users/you/ScreenShotPP/src/overlay.js`:
```js
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

const img = document.getElementById("shot");
const canvas = document.getElementById("dim");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("toolbar");

let start = null;          // point de départ en pixels CSS
let selection = null;      // { x, y, w, h } en pixels CSS
let scale = 1;             // pixels physiques par pixel CSS (capture / affichage)

// Charger la capture gelée et l'afficher.
const dataUrl = await invoke("get_capture_data_url");
img.src = dataUrl;
img.onload = () => {
  resizeCanvas();
  // Échelle entre l'image capturée (physique) et son affichage CSS.
  scale = img.naturalWidth / img.clientWidth;
  drawDim();
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function drawDim() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (selection) {
    // Éclaircir la zone sélectionnée (efface l'assombrissement).
    ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
    ctx.strokeStyle = "#4da3ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
  }
}

window.addEventListener("mousedown", (e) => {
  if (e.target.closest("#toolbar")) return;
  toolbar.classList.add("hidden");
  start = { x: e.clientX, y: e.clientY };
  selection = null;
});

window.addEventListener("mousemove", (e) => {
  if (!start) return;
  const x = Math.min(start.x, e.clientX);
  const y = Math.min(start.y, e.clientY);
  const w = Math.abs(e.clientX - start.x);
  const h = Math.abs(e.clientY - start.y);
  selection = { x, y, w, h };
  drawDim();
});

window.addEventListener("mouseup", () => {
  if (!start || !selection || selection.w < 3 || selection.h < 3) {
    start = null;
    return;
  }
  start = null;
  positionToolbar();
  toolbar.classList.remove("hidden");
});

window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") await invoke("cancel_capture");
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && selection) {
    await doCopy();
  }
});

function positionToolbar() {
  toolbar.style.left = `${selection.x}px`;
  toolbar.style.top = `${selection.y + selection.h + 8}px`;
}

// Convertit la sélection CSS en rectangle de pixels physiques pour le recadrage.
function physicalRect() {
  return {
    x: Math.round(selection.x * scale),
    y: Math.round(selection.y * scale),
    width: Math.round(selection.w * scale),
    height: Math.round(selection.h * scale),
  };
}

async function doCopy() {
  await invoke("copy_selection", { rect: physicalRect() });
}

document.getElementById("copy-btn").addEventListener("click", doCopy);
document.getElementById("cancel-btn").addEventListener("click", () =>
  invoke("cancel_capture")
);
document.getElementById("save-btn").addEventListener("click", async () => {
  const suggested = await invoke("default_save_name", { format: "png" });
  const path = await save({
    defaultPath: suggested,
    filters: [
      { name: "PNG", extensions: ["png"] },
      { name: "JPEG", extensions: ["jpg", "jpeg"] },
    ],
  });
  if (!path) return;
  const format = path.toLowerCase().endsWith(".jpg") || path.toLowerCase().endsWith(".jpeg")
    ? "jpeg"
    : "png";
  await invoke("save_selection", { rect: physicalRect(), path, format });
});

window.addEventListener("resize", () => {
  resizeCanvas();
  scale = img.naturalWidth / img.clientWidth;
  drawDim();
});
```

- [ ] **Step 9: Installer les paquets JS du dialog**

Run:
```bash
cd /Users/you/ScreenShotPP
npm install @tauri-apps/plugin-dialog
```

- [ ] **Step 10: Vérifier la compilation Rust**

Run:
```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20
```
Expected: compilation réussie.

- [ ] **Step 11: Vérification manuelle de bout en bout**

Run:
```bash
cd /Users/you/ScreenShotPP
npm run tauri dev
```
Sur **macOS**, accorder la permission « Enregistrement de l'écran » si demandée
(Réglages Système → Confidentialité et sécurité → Enregistrement de l'écran), puis
relancer si nécessaire.

Vérifier (**manuel**) :
1. Appuyer sur **⌘⇧2** → l'écran se fige avec un voile sombre.
2. Glisser pour sélectionner une zone → la zone s'éclaircit, un cadre bleu apparaît.
3. Relâcher → la barre **Copy / Save / Cancel** apparaît sous la sélection.
4. **Copy** (ou ⌘C) → coller ailleurs (⌘V) reproduit la zone. ✅
5. Re-déclencher, **Save** → choisir un emplacement → un PNG correct est écrit. ✅
6. **Cancel** ou **Échap** → l'overlay se ferme sans rien faire. ✅

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: end-to-end capture flow with selection overlay, copy and save"
```

---

## Task 9: Tests automatisés Windows via GitHub Actions (CI)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Écrire le workflow CI**

Create `/Users/you/ScreenShotPP/.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
  pull_request:

jobs:
  test:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - name: Cargo tests (logique pure)
        run: cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Note : seuls les tests unitaires (logique pure : settings, storage, capture/crop)
tournent en CI ; la capture réelle et l'UI nécessitent un écran et restent en
vérification manuelle (UTM + run local).

- [ ] **Step 2: Vérifier la syntaxe du workflow localement (optionnel)**

Run:
```bash
cat /Users/you/ScreenShotPP/.github/workflows/ci.yml
```
Expected: le contenu YAML s'affiche sans erreur.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: run pure-logic cargo tests on macOS and Windows"
```

---

## Critère d'acceptation du Palier 1

- L'app démarre en arrière-plan, **sans icône Dock (macOS) ni barre des tâches (Windows)**,
  avec une icône de menu bar/tray proposant **Quit**.
- Le raccourci global **⌘⇧2 / Ctrl⇧2** déclenche la capture.
- On peut **sélectionner une zone**, puis la **copier** (presse-papier) ou
  l'**enregistrer** en **PNG/JPEG**.
- `cargo test` passe (settings, storage, capture/crop) sur macOS et Windows en CI.

## Ce qui est volontairement reporté
- Outils d'annotation (Palier 2), OCR + mosaïque (Palier 3), fenêtre de réglages et
  installateurs signés (Palier 4).
- WebP, sélection multi-moniteur complète, persistance des réglages sur disque.
