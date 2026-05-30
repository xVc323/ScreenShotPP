# Palier 4a — Réglages & persistance — Design

- **Date** : 2026-05-31
- **Statut** : Design validé
- **Dépend de** : Paliers 1-3.
- **Contexte parent** : `docs/superpowers/specs/2026-05-30-screenshotpp-design.md` (§8 Réglages)

---

## 1. Objectif
Une **fenêtre de réglages** persistés : raccourci de capture, dossier de sauvegarde par
défaut, format par défaut, langue OCR, version. Appliqués **immédiatement** et **sauvegardés
sur disque**. Aujourd'hui rien n'est persisté (le code utilise `Settings::default()`), le
menu tray n'a que **Quit**, et la fenêtre principale est un placeholder.

## 2. Persistance
- `Settings` (struct existante : `capture_shortcut`, `default_save_folder`, `default_format`,
  `ocr_language`) **sérialisée en JSON** dans `app_config_dir()/settings.json`.
- `settings.rs` : `path(app)`, `load(app) -> Settings` (défauts si absent/invalide),
  `save(app, &Settings) -> Result<(),String>` (crée le dossier).
- État partagé `SettingsState(Mutex<Settings>)` (managed). Chargé au démarrage ; le raccourci
  global est enregistré **depuis le réglage chargé**.

## 3. Fenêtre de réglages (= fenêtre principale)
- Menu tray : ajout **« Open settings »** → `window("main").show() + set_focus()`.
- Fermeture de la fenêtre = **masquer** (pas quitter) : interception du close-requested.
- Formulaire (`index.html` / `main.js` / `main.css`, APIs via `window.__TAURI__`) :
  - **Raccourci** : champ **enregistreur de touches** (clic → capte la combinaison).
  - **Dossier par défaut** : chemin + bouton **Choisir…** (`dialog.open({directory:true})`).
  - **Format par défaut** : PNG / JPEG.
  - **Langue OCR** : Auto / en-US / fr-FR / es-ES / de-DE.
  - **Version** : lecture seule.
- Chaque changement → `update_settings(settings)` (persiste + applique).

## 4. Application
- **Raccourci** : `update_settings` ré-enregistre le raccourci global (`unregister_all` puis
  enregistre le nouveau).
- **Dossier** : commande `default_save_path(format)` = `dossier/Capture ….ext` (dossier vide
  → Bureau via `desktop_dir()`). L'overlay l'utilise comme `defaultPath` d'enregistrement.
- **Langue OCR** : `ocr_region` lit la langue depuis l'état et la passe à
  `ocr::recognize(img, lang)` → Swift (`recognitionLanguages` ; « auto » = détection auto).
- **Format** : extension par défaut proposée.

## 5. Architecture / fichiers
- `settings.rs` : path/load/save + `SettingsState`.
- `commands.rs` : `get_settings`, `update_settings`, `default_save_path`, `app_version` ;
  `ocr_region` passe la langue.
- `lib.rs` : manage `SettingsState`, charge au démarrage, enregistre le raccourci depuis
  les réglages, handlers, intercepte le close de « main ».
- `tray.rs` : item « Open settings ».
- `hotkey.rs` : `reregister(app, accelerator)`.
- `ocr.rs` + `swift-lib/lib.swift` : param langue.
- Frontend : `src/index.html`, `src/main.js`, `src/main.css` (réglages) ; `src/accelerator.js`
  (pur) + `src/accelerator.test.js` ; `overlay.js` : `default_save_path` à l'enregistrement.
- Capabilities : `dialog:allow-open` (sélecteur de dossier) pour la fenêtre « main ».

## 6. Tests
- Rust : `settings::load`/`save` round-trip (fichier temporaire).
- Frontend pur : **`keyEventToAccelerator(event)`** (modificateurs + touche → « CmdOrCtrl+
  Shift+2 », ou `null` si seulement des modificateurs) → `node:test` (ajouté à la CI).
- UI + application Vision/raccourci = vérif GUI manuelle.

## 7. Critère d'acceptation
Ouvrir les réglages depuis le tray ; changer le raccourci (enregistreur) → la capture
répond au nouveau ; choisir un dossier → l'enregistrement y propose par défaut ; changer la
langue OCR → l'OCR l'utilise ; la version s'affiche ; **tout est conservé après redémarrage
de l'app**. CI verte.

## 8. Reporté
OCR Windows (4b), optimisations (4c), distribution (4d). Réglages avancés (thèmes, etc.).
