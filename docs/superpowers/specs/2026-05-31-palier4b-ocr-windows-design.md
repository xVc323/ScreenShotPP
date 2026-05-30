# Palier 4b — OCR Windows — Design

- **Date** : 2026-05-31
- **Statut** : Design validé
- **Dépend de** : Palier 3a (interface `ocr::recognize`).

---

## 1. Objectif
Implémenter l'OCR sur **Windows** (Windows.Media.Ocr) derrière l'interface existante
`ocr::recognize(&RgbaImage, &str) -> Result<String, String>` (aujourd'hui un stub hors
macOS). Aucune modification du frontend ni de `ocr_region` ; la langue des réglages est déjà
transmise.

## 2. Moteur : `windows` crate (windows-rs)
- Dépendance **ciblée Windows uniquement** :
  `[target.'cfg(windows)'.dependencies] windows = { version = "0.58", features = [...] }`
  → **aucun impact sur le build/CI macOS** (crate exclue hors Windows).
- Features : `Media_Ocr`, `Graphics_Imaging`, `Storage_Streams`, `Globalization`,
  `Foundation`, `Win32_System_Com`.

## 3. Implémentation (`ocr.rs`, chemin Windows)
`recognize(img, lang)` sur Windows :
1. Initialiser l'apartment COM (MTA) du thread (`CoInitializeEx`, ignore
   `RPC_E_CHANGED_MODE`). On est dans `spawn_blocking`, donc le blocage est acceptable.
2. Encoder l'image en PNG (`storage::encode_image`) → `InMemoryRandomAccessStream` via
   `DataWriter` → `BitmapDecoder` → `SoftwareBitmap`, converti en **Bgra8 / Premultiplied**.
3. `OcrEngine` : `lang == "auto"` → `TryCreateFromUserProfileLanguages()` ; sinon
   `TryCreateFromLanguage(Language(lang))` avec **repli** sur le profil si indisponible.
4. `engine.RecognizeAsync(bitmap).get()?.Text()` → texte ; `Ok(texte)` (ou `Err` détaillé).
- Le chemin Windows vit dans un sous-module `#[cfg(windows)] mod windows_impl`. Le stub
  « pas disponible » est conservé pour les autres OS (`not(macos)` et `not(windows)`).

## 4. Tests & validation
- **Pas de test fonctionnel** : la crate `windows` ne compile pas sur macOS ; les runners CI
  Windows n'ont pas de pack de langue garanti et l'OCR async sur runner headless est
  incertain.
- **Validation = compilation sur le runner CI Windows** (`cargo test --lib` compile tout le
  lib, y compris `windows_impl`). Itération sur les erreurs de compilation jusqu'au vert.
- Test fonctionnel réel = sur une vraie machine Windows, plus tard.

## 5. Critère d'acceptation
CI **macOS + Windows vertes** (donc le code OCR Windows compile et le macOS reste intact).
Interface `ocr::recognize` inchangée.

## 6. Reporté
Test fonctionnel Windows réel ; gestion fine des packs de langue manquants (message
utilisateur dédié) ; 4d distribution.
