# Palier 4a — Réglages & persistance — Implementation Plan

> Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fenêtre de réglages persistés (raccourci, dossier, format, langue OCR, version), appliqués immédiatement.

Branche : `palier-4a-reglages`.

---

## Task 1: Rust — persistance des réglages (TDD du load/save fichier)

**Files:** Modify `src-tauri/src/settings.rs`

- [ ] **Step 1:** ajouter en tête `use std::path::Path; use tauri::Manager;` et, après l'`impl Default`, les fonctions + l'état :
```rust
/// Charge des réglages depuis un chemin (défauts si absent/invalide).
pub fn load_from_path(path: &Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Écrit les réglages en JSON (crée le dossier parent).
pub fn save_to_path(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// Chemin du fichier de réglages dans le dossier de config de l'app.
pub fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

pub fn load(app: &tauri::AppHandle) -> Settings {
    match settings_path(app) {
        Ok(p) => load_from_path(&p),
        Err(_) => Settings::default(),
    }
}

pub fn save(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    save_to_path(&path, settings)
}

/// Réglages courants partagés (chargés au démarrage).
#[derive(Default)]
pub struct SettingsState(pub std::sync::Mutex<Settings>);
```

- [ ] **Step 2: tests** (dans le `#[cfg(test)] mod tests`) :
```rust
    #[test]
    fn save_then_load_round_trips_through_a_file() {
        let mut path = std::env::temp_dir();
        path.push(format!("sspp-settings-{}.json", std::process::id()));
        let mut s = Settings::default();
        s.capture_shortcut = "CmdOrCtrl+Shift+9".to_string();
        s.ocr_language = "fr-FR".to_string();
        save_to_path(&path, &s).unwrap();
        assert_eq!(load_from_path(&path), s);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn loading_missing_file_yields_defaults() {
        let path = std::path::Path::new("/tmp/sspp-does-not-exist-xyz.json");
        assert_eq!(load_from_path(path), Settings::default());
    }
```

- [ ] **Step 3:** `cargo test --manifest-path src-tauri/Cargo.toml settings::` → vert. **commit.**

---

## Task 2: Rust — état + chargement au démarrage + raccourci depuis les réglages

**Files:** Modify `src-tauri/src/lib.rs`, `src-tauri/src/hotkey.rs`

- [ ] **Step 1: `hotkey.rs`** — ajouter le ré-enregistrement :
```rust
/// Désenregistre tout puis enregistre le raccourci de capture courant.
pub fn reregister(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    register_capture_shortcut(app, accelerator)
}
```

- [ ] **Step 2: `lib.rs`** — dans `setup`, remplacer le bloc raccourci par un chargement réel :
```rust
            let settings = settings::load(&app.handle());
            hotkey::register_capture_shortcut(app.handle(), &settings.capture_shortcut)?;
            app.manage(settings::SettingsState(std::sync::Mutex::new(settings)));
```
et ajouter `.manage(...)` n'est pas nécessaire ailleurs (fait ici). Garder `use commands::CaptureState;` etc.

- [ ] **Step 3:** `cargo build` ; **commit.**

---

## Task 3: Rust — commandes réglages + application + close-to-hide

**Files:** Modify `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/tray.rs`, `src-tauri/capabilities/default.json`

- [ ] **Step 1: `commands.rs`** — ajouter :
```rust
use crate::settings::{self, Settings, SettingsState};

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    app.state::<SettingsState>().0.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, new_settings: Settings) -> Result<(), String> {
    // applique le raccourci
    crate::hotkey::reregister(&app, &new_settings.capture_shortcut)?;
    settings::save(&app, &new_settings)?;
    *app.state::<SettingsState>().0.lock().unwrap_or_else(|e| e.into_inner()) = new_settings;
    Ok(())
}

#[tauri::command]
pub fn default_save_path(app: AppHandle, format: String) -> String {
    let s = app.state::<SettingsState>().0.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let name = settings_current_filename(&format);
    let folder = if s.default_save_folder.is_empty() {
        app.path().desktop_dir().ok()
    } else {
        Some(std::path::PathBuf::from(s.default_save_folder))
    };
    match folder {
        Some(dir) => dir.join(name).to_string_lossy().to_string(),
        None => name,
    }
}

fn settings_current_filename(format: &str) -> String {
    storage::current_filename(storage::SaveFormat::from_str(format))
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}
```
(`use tauri::Manager;` déjà présent ; ajouter `use crate::storage;` si absent — il l'est déjà.)

- [ ] **Step 2: `lib.rs` invoke_handler** : ajouter `commands::get_settings, commands::update_settings, commands::default_save_path, commands::app_version`.

- [ ] **Step 3: close-to-hide** — dans `lib.rs` `setup`, après création/gestion, ajouter un handler sur la fenêtre `main` :
```rust
            if let Some(main) = app.get_webview_window("main") {
                let w = main.clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }
```

- [ ] **Step 4: `tray.rs`** — ajouter l'item « Open settings » avant Quit, et gérer l'event :
```rust
    let settings_item = MenuItem::with_id(app, "settings", "Open settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings_item, &quit])?;
    // ... dans on_menu_event :
    //   "settings" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
    //   "quit" => app.exit(0)
```
(adapter l'`on_menu_event` existant ; importer `tauri::Manager` pour `get_webview_window`.)

- [ ] **Step 5: capability** `dialog:allow-open` ajouté aux permissions, et la capability doit couvrir la fenêtre `main` (déjà dans `windows: ["main","overlay"]`).

- [ ] **Step 6:** `cargo build` ; **commit.**

---

## Task 4: Rust + Swift — langue OCR

**Files:** Modify `src-tauri/swift-lib/Sources/swift-lib/lib.swift`, `src-tauri/src/ocr.rs`, `src-tauri/src/commands.rs`

- [ ] **Step 1: Swift** — `ocr_recognize` prend une langue :
```swift
@_cdecl("ocr_recognize")
public func ocr_recognize(_ data: SRData, _ langs: SRString) -> SRString {
    // ... décodage identique ...
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let langValue = langs.toString()
    if langValue == "auto" {
        if #available(macOS 13.0, *) { request.automaticallyDetectsLanguage = true }
    } else {
        request.recognitionLanguages = langValue.split(separator: ",").map(String.init)
    }
    // ... perform + réponse JSON identiques ...
}
```

- [ ] **Step 2: `ocr.rs`** — propager la langue :
```rust
swift!(pub(crate) fn ocr_recognize(data: SRData, langs: SRString) -> SRString);
// recognize(img, lang) -> recognize_png(&png, lang) -> ocr_recognize(SRData::from(png), SRString::from(lang))
```
Adapter les signatures `recognize`/`recognize_png` pour accepter `lang: &str`. Le stub
non-macOS prend aussi `lang`.

- [ ] **Step 3: `commands.rs` `ocr_region`** — lire la langue dans l'état et la passer :
```rust
    let lang = app.state::<SettingsState>().0.lock().unwrap_or_else(|e| e.into_inner()).ocr_language.clone();
    crate::ocr::recognize(&cropped, &lang)
```
(le crop reste fait en relâchant le verrou capture comme aujourd'hui.)

- [ ] **Step 4:** adapter les tests OCR existants (`recognize(&img, "auto")`). `cargo test` ; **commit.**

---

## Task 5: Frontend pur — `keyEventToAccelerator` (TDD)

**Files:** Create `src/accelerator.js`, `src/accelerator.test.js`

- [ ] **Step 1: tests** :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyEventToAccelerator } from "./accelerator.js";

test("Cmd+Shift+2", () => {
  assert.equal(keyEventToAccelerator({ metaKey: true, shiftKey: true, key: "2", code: "Digit2" }), "CmdOrCtrl+Shift+2");
});
test("Ctrl+A", () => {
  assert.equal(keyEventToAccelerator({ ctrlKey: true, key: "a", code: "KeyA" }), "Ctrl+A");
});
test("modificateurs seuls → null", () => {
  assert.equal(keyEventToAccelerator({ shiftKey: true, key: "Shift", code: "ShiftLeft" }), null);
});
test("Alt+F5", () => {
  assert.equal(keyEventToAccelerator({ altKey: true, key: "F5", code: "F5" }), "Alt+F5");
});
```

- [ ] **Step 2: implémenter `src/accelerator.js`** :
```js
const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);
const NAMED = { " ": "Space", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Escape: "Escape", Enter: "Enter", Tab: "Tab" };

export function keyEventToAccelerator(event) {
  const mods = [];
  if (event.metaKey) mods.push("CmdOrCtrl");
  if (event.ctrlKey && !event.metaKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  const main = mainKey(event);
  if (!main) return null;
  return [...mods, main].join("+");
}

function mainKey(event) {
  const k = event.key;
  if (MODIFIER_KEYS.has(k)) return null;
  if (NAMED[k]) return NAMED[k];
  if (/^[a-z]$/i.test(k)) return k.toUpperCase();
  if (/^[0-9]$/.test(k)) return k;
  if (/^F[0-9]{1,2}$/.test(k)) return k;
  if (/^Digit[0-9]$/.test(event.code || "")) return event.code.replace("Digit", "");
  if (/^Key[A-Z]$/.test(event.code || "")) return event.code.replace("Key", "");
  return null;
}
```

- [ ] **Step 3:** `node --test src/accelerator.test.js` → vert ; **commit.**

---

## Task 6: Frontend — fenêtre de réglages

**Files:** Modify `src/index.html`, `src/main.js`, create `src/main.css`

- [ ] **Step 1: `src/index.html`** — formulaire :
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ScreenShotPP — Settings</title>
    <link rel="stylesheet" href="main.css" />
  </head>
  <body>
    <main class="settings">
      <h1>Settings</h1>
      <label>Capture shortcut
        <button id="shortcut" class="recorder" type="button">…</button>
      </label>
      <label>Default save folder
        <span class="row"><span id="folder" class="path">Desktop</span><button id="choose-folder" type="button">Choose…</button></span>
      </label>
      <label>Default format
        <select id="format"><option value="png">PNG</option><option value="jpeg">JPEG</option></select>
      </label>
      <label>OCR language
        <select id="ocr-language">
          <option value="auto">Auto-detect</option>
          <option value="en-US">English</option>
          <option value="fr-FR">Français</option>
          <option value="es-ES">Español</option>
          <option value="de-DE">Deutsch</option>
        </select>
      </label>
      <p class="version">Version <span id="version">—</span></p>
    </main>
    <script type="module" src="main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: `src/main.css`** — style sobre (fond sombre cohérent), libellés, champs.

- [ ] **Step 3: `src/main.js`** :
```js
import { keyEventToAccelerator } from "./accelerator.js";
const { invoke } = window.__TAURI__.core;
const dialog = window.__TAURI__.dialog;

const shortcutBtn = document.getElementById("shortcut");
const folderEl = document.getElementById("folder");
const formatSel = document.getElementById("format");
const langSel = document.getElementById("ocr-language");

let settings = await invoke("get_settings");
render();
document.getElementById("version").textContent = await invoke("app_version");

function render() {
  shortcutBtn.textContent = settings.capture_shortcut;
  folderEl.textContent = settings.default_save_folder || "Desktop";
  formatSel.value = settings.default_format;
  langSel.value = settings.ocr_language;
}
async function persist() { await invoke("update_settings", { newSettings: settings }); }

// enregistreur de touches
let recording = false;
shortcutBtn.addEventListener("click", () => { recording = true; shortcutBtn.textContent = "Press a combination…"; });
window.addEventListener("keydown", async (e) => {
  if (!recording) return;
  e.preventDefault();
  const acc = keyEventToAccelerator(e);
  if (!acc) return; // attend une vraie touche
  recording = false;
  settings = { ...settings, capture_shortcut: acc };
  render();
  await persist();
});

document.getElementById("choose-folder").addEventListener("click", async () => {
  const dir = await dialog.open({ directory: true });
  if (!dir) return;
  settings = { ...settings, default_save_folder: dir };
  render();
  await persist();
});
formatSel.addEventListener("change", async () => { settings = { ...settings, default_format: formatSel.value }; await persist(); });
langSel.addEventListener("change", async () => { settings = { ...settings, ocr_language: langSel.value }; await persist(); });
```

- [ ] **Step 4:** `node --check src/main.js` ; **commit.**

---

## Task 7: overlay — dossier par défaut à l'enregistrement

**Files:** Modify `src/overlay.js`

- [ ] **Step 1:** dans `doSave`, remplacer le `defaultPath` (nom seul) par le chemin complet :
```js
    const suggested = await invoke("default_save_path", { format: target === "full" ? formatFromName : "jpeg" });
```
Concrètement : appeler `default_save_path` (qui inclut le dossier réglé) au lieu de
`default_save_name`. Garder la logique de format/extension existante.

- [ ] **Step 2:** `node --check src/overlay.js` ; **commit.**

---

## Task 8: CI + build + GUI

**Files:** Modify `.github/workflows/ci.yml`

- [ ] **Step 1:** ajouter `src/accelerator.test.js` à la commande `node --test`.
- [ ] **Step 2:** `npm run tauri build` ; tester : ouvrir réglages (tray), changer raccourci
  (enregistreur → la capture répond au nouveau), choisir dossier (l'enregistrement y va),
  langue OCR (effet sur l'OCR), version affichée, **persistance après redémarrage**.
- [ ] **Step 3:** corriger au besoin ; **commit.**

## Critère d'acceptation
Voir `docs/superpowers/specs/2026-05-31-palier4a-reglages-design.md` §7.
