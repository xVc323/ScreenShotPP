# Palier 4c — Optimisations & robustesse — Design

- **Date** : 2026-05-31
- **Statut** : Design validé
- **Dépend de** : Paliers 1-4a.
- **Contexte parent** : design principal §14 (problèmes connus).

---

## 1. Objectif
Deux améliorations de robustesse :
1. **Protocole natif `capture://`** pour servir l'image d'affichage → supprime la limite de
   taille du data URL (bug 5K) **et** réduit la latence d'ouverture.
2. **Capture de l'écran sous le curseur** (au lieu de toujours l'écran principal).

## 2. Partie A — Protocole `capture://`
- Enregistrement d'un schéma d'URI custom `capture` (builder Tauri) : le handler lit
  `CaptureState`, encode la capture en **PNG rapide** (`encode_png_fast`) et renvoie les
  octets avec `Content-Type: image/png` + `Access-Control-Allow-Origin: *`.
- Overlay : `<img crossOrigin="anonymous" src="capture://localhost/current?t=…">`
  (sous Windows : `http://capture.localhost/current`).
- La commande `get_capture_data_url` (base64) est **retirée** (remplacée).
- **Export sans perte préservé** : l'en-tête CORS + `crossOrigin="anonymous"` évitent le
  « canvas taint » → `stage.toCanvas().toDataURL()` continue de fonctionner.
- CSP désactivée (`csp: null`) → chargement `capture://` non bloqué.

## 3. Partie B — Écran sous le curseur
- À la capture : récupérer la **position du curseur** (`app.cursor_position()`), trouver le
  moniteur qui le contient, **capturer cet écran**, et **épingler l'overlay** dessus.
- Fonction pure **`monitor_at(rects, x, y) -> Option<usize>`** (index du moniteur contenant
  le point) → utilisée à la fois pour la capture (géométries xcap) et l'épinglage de
  l'overlay (géométries Tauri `available_monitors`). Même logique, deux jeux de rectangles.
- L'échelle/recadrage/export **s'adaptent déjà par écran** (le `scale =
  naturalWidth/innerWidth` se recalcule). Peu de changements en aval.
- Repli sur l'écran principal si le curseur n'est sur aucun moniteur connu.

## 4. Architecture / fichiers
- `capture.rs` : `MonitorRect`, `monitor_at` (+ tests), `capture_at(x, y) -> RgbaImage`
  (utilise `monitor_at` sur les moniteurs xcap, repli primaire).
- `commands.rs` : `start_capture` = curseur → `capture_at` → overlay épinglé au moniteur
  Tauri sous le curseur ; retrait de `get_capture_data_url`.
- `lib.rs` : `register_uri_scheme_protocol("capture", …)` ; retrait du handler
  `get_capture_data_url`.
- `overlay.js` : chargement via `capture://` + `crossOrigin`.

## 5. Tests
- Rust : `monitor_at` (pur, rectangles synthétiques : point dans/hors, multi-écrans).
- **Vérif GUI manuelle** (les 2 risques) : Copy/Save fonctionnent toujours (pas de taint) ;
  la capture/overlay s'ouvrent sur l'écran du curseur (tester avec un 2ᵉ écran si dispo, ou
  au moins non-régression sur l'écran principal).

## 6. Critère d'acceptation
Capture nette sans flash blanc sur grand écran (5K OK) ; latence réduite ; Copy/Save/OCR
inchangés (pas de canvas taint) ; ⌘⇧2 capture l'écran du curseur. macOS + Windows, CI verte.

## 7. Reporté
4b (OCR Windows), 4d (distribution). Overlay s'étendant sur tous les écrans à la fois.
