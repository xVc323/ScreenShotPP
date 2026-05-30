# Fonctionnalité — Taille de sortie (compression) — Design

- **Date** : 2026-05-30
- **Statut** : Design validé
- **Dépend de** : Palier 2 (éditeur complet, mergé dans `master`)

---

## 1. Objectif
Permettre de choisir une **taille maximale** pour l'image produite, afin de la copier/
enregistrer légère (cas d'usage : coller dans Discord/chat où les gros fichiers ne passent
pas). Sélecteur dans la barre d'outils : **Full / ≤5 Mo / ≤2 Mo / ≤1 Mo**, appliqué à la
fois à **Copier** et **Enregistrer**, mémorisé entre captures.

## 2. Comportement par média (point clé)
Le presse-papier transporte l'image **sans perte** (PNG/TIFF) ; un JPEG « ne traverse » pas
le copier-coller. Le levier fiable diffère donc selon l'action :
- **Copier ≤ N** → **réduction de résolution** (downscale) jusqu'à ce que le PNG tienne sous
  N. Image nette, moins de pixels → collage plus léger (Discord ré-encode le bitmap collé).
- **Enregistrer ≤ N** → **recherche de qualité JPEG** à pleine résolution pour tenir sous N
  (downscale en dernier recours si N très bas). Fichier `.jpg`.
- **Full** → comportement actuel : copie PNG sans perte ; enregistrement PNG/JPEG au choix.

## 3. Architecture
- Les commandes `copy_composited` / `save_composited` reçoivent un paramètre **`target`**
  (`"full" | "5mb" | "2mb" | "1mb"`).
- Rust (crate `image`) réalise la réduction. Fonctions **pures et testées** dans
  `storage.rs` :
  - `target_max_bytes(&str) -> Option<usize>` (mapping cible → octets, `None` = full).
  - `fit_by_downscale(&RgbaImage, max_bytes) -> RgbaImage` (downscale itératif jusqu'à ce que
    le PNG tienne sous la cible ; borne mini de taille).
  - `encode_jpeg_quality(&RgbaImage, quality) -> Vec<u8>` (JPEG à qualité donnée).
  - `fit_by_jpeg_quality(&RgbaImage, max_bytes) -> Vec<u8>` (qualité décroissante, puis
    downscale si nécessaire).
- `copy_composited` : si cible → `fit_by_downscale` → presse-papier ; sinon image pleine.
- `save_composited` : si cible → `fit_by_jpeg_quality` → écrit les octets (`.jpg`) ; sinon
  comportement actuel (PNG/JPEG selon `format`).

## 4. Interface (frontend)
- `overlay.html` : `<select id="output-size">` (Full / 5 Mo / 2 Mo / 1 Mo) dans le groupe
  d'actions de la barre.
- `overlay.js` : persistance `localStorage` (clé `outputSize`) ; `doCopy` passe `target` ;
  `doSave` : si cible ≠ full → nom par défaut `.jpg`, `format="jpeg"`, chemin forcé en
  `.jpg`, et passe `target`.
- `overlay.css` : largeur du sélecteur (réutilise le style `.toolbar select`).

## 5. Tests
- Rust (TDD, image synthétique à forte entropie pour que PNG/JPEG soient gros) :
  - `target_max_bytes` mapping.
  - `fit_by_downscale` : résultat dont le PNG ≤ cible et dimensions réduites.
  - `fit_by_jpeg_quality` : octets ≤ cible.
  - `encode_jpeg_quality` : entête JPEG (`FF D8`).
- GUI manuelle : copier ≤2 Mo puis coller (vérifier que c'est plus léger), enregistrer
  ≤1 Mo (fichier `.jpg` sous la cible), Full inchangé.

## 6. Critère d'acceptation
Sélecteur de taille fonctionnel et mémorisé ; copie réduite en résolution sous la cible ;
enregistrement JPEG sous la cible ; Full = comportement d'avant. macOS + Windows, CI verte.

## 7. Reporté
Réglage fin (qualité JPEG manuelle, cible en pixels), aperçu de la taille estimée avant
action.
