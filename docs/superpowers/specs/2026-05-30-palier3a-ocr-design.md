# Palier 3a — OCR (Apple Vision, macOS) — Design

- **Date** : 2026-05-30
- **Statut** : Design validé
- **Dépend de** : Palier 2 (éditeur complet) + capture pleine résolution en `CaptureState`.
- **Contexte parent** : `docs/superpowers/specs/2026-05-30-screenshotpp-design.md` (§6 OCR)

---

## 1. Objectif
Extraire le **texte d'une zone sélectionnée** par OCR, l'afficher dans un **panneau
d'aperçu éditable** dans l'overlay, et le copier dans le presse-papier. Moteur : **Apple
Vision** (natif macOS) via un pont **Swift ↔ Rust (`swift-rs`)**.

## 2. Périmètre 3a
- **macOS uniquement** (Vision). L'OCR **Windows** (Windows.Media.Ocr) = suite, derrière la
  même interface `ocr::recognize`. Sur les plateformes non-macOS, `recognize` renvoie une
  erreur « OCR pas encore disponible ».
- **Langue : détection automatique** (Vision, macOS 13+). Sélecteur de langue = Palier 4.
- Mosaïque = Palier 3b.

## 3. Moteur : Apple Vision via swift-rs
- Petit paquet Swift `src-tauri/swift-lib/` exposant `@_cdecl("ocr_recognize")` :
  reçoit les octets PNG, décode en `CGImage`, lance `VNRecognizeTextRequest`
  (`.accurate`, `usesLanguageCorrection`, `automaticallyDetectsLanguage` si dispo),
  joint les lignes reconnues, renvoie une `SRString`.
- `build.rs` compile/linke le Swift via `swift_rs::SwiftLinker` **sous `#[cfg(target_os =
  "macos")]` uniquement** + link des frameworks `Vision`/`CoreGraphics`/`ImageIO`. Les
  builds et la **CI Windows ne sont pas affectés** (aucune compilation Swift).

## 4. Déroulé
1. Sélection faite → bouton **OCR** (texte « OCR » dans la barre, actif seulement si
   sélection ; comme Copy/Save).
2. Frontend envoie le **rectangle physique** de la sélection (`selection × scale`).
3. `ocr_region(rect)` (Rust) : recadre la capture pleine résolution (`crop_region`),
   encode PNG, appelle `ocr::recognize` → texte.
4. Frontend affiche un **panneau d'aperçu dans l'overlay** : `<textarea>` éditable
   pré-rempli, bouton **Copy** (texte → presse-papier via `copy_text`, puis ferme
   l'overlay) et **Close** (referme le panneau, retour à l'édition).

## 5. Architecture / fichiers
- `src-tauri/swift-lib/Package.swift` + `Sources/swift-lib/lib.swift` (Swift Vision).
- `src-tauri/build.rs` : + `SwiftLinker` (macOS) + frameworks.
- `src-tauri/Cargo.toml` : dep `swift-rs` (runtime + build).
- `src-tauri/src/ocr.rs` : `recognize(&RgbaImage) -> Result<String,String>` (macOS → Swift ;
  autre → erreur).
- `src-tauri/src/commands.rs` : `ocr_region(rect)`, `copy_text(text)`.
- `src-tauri/src/lib.rs` : `mod ocr;` + handlers.
- `src-tauri/capabilities/default.json` : + `clipboard-manager:allow-write-text`.
- Frontend : `editor.js` expose `selectionPhysicalRect()` ; `overlay.html/css/js` : bouton
  OCR + panneau d'aperçu.

## 6. Tests
- `crop_region` déjà testé (Rust). L'OCR lui-même (Vision) = **vérification GUI manuelle
  sur macOS** (capturer une zone de texte → vérifier le texte reconnu, FR + EN).
- CI inchangée (Swift compilé uniquement sur macOS ; `cargo test` ne touche pas Vision).

## 7. Stratégie d'implémentation (dérisquage)
Valider le **pont swift-rs** d'abord avec une fonction Swift **triviale** (retourne une
constante), prouver qu'elle compile/linke/s'appelle depuis Rust ; **ensuite** seulement
remplacer par le vrai code Vision. Évite de mélanger « le pont ne marche pas » et « l'API
Vision est fausse ».

## 8. Critère d'acceptation 3a
Sur le `.app` release macOS : sélectionner une zone contenant du texte → OCR → le texte
reconnu s'affiche dans le panneau → Copy le met dans le presse-papier. Build Windows + CI
toujours verts (OCR Windows en stub).

## 9. Reporté
OCR Windows (Windows.Media.Ocr), sélecteur de langue (Palier 4 réglages), mosaïque (3b).
