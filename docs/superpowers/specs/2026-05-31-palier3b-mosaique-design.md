# Palier 3b — Mosaïque (masquage) — Design

- **Date** : 2026-05-31
- **Statut** : Design validé
- **Dépend de** : Palier 2 (éditeur Konva) + Palier 3a.
- **Contexte parent** : `docs/superpowers/specs/2026-05-30-screenshotpp-design.md` (§5)

---

## 1. Objectif
Ajouter un outil **Mosaïque** à l'éditeur pour masquer une zone (infos sensibles) par
**pixelisation** (gros blocs, texte illisible). Dernière brique fonctionnelle de l'éditeur.

## 2. Comportement
- Outil **Mosaic** dans la barre. **Glisser un rectangle** dans la sélection (comme
  l'outil Rectangle).
- Au relâcher : une **tuile pixelisée** de la zone du screenshot dessous est créée.
  **Déplaçable** (tampon pixelisé), **supprimable**, dans l'**undo/redo**, **fusionnée à
  l'export** (Copy/Save).
- **Intensité fixe** (taille de bloc généreuse). **Pas de redimensionnement** après coup
  (sélection = déplacement seul).

## 3. Architecture (intégration dans `editor.js`)
- Descripteur `mosaic` : `{ id, type:"mosaic", x, y, width, height, cropX, cropY }`
  (`cropX/Y` = coin de la zone source en pixels de la capture, figé à la création).
- Rendu : `Konva.Image` avec `image: o.image` (la capture), `crop` = zone source,
  taille/position = zone à l'écran, `filters: [Konva.Filters.Pixelate]`, `pixelSize` fixe,
  puis `.cache()` (requis pour appliquer le filtre).
- Tracé : glisser comme le rectangle. Pendant le glissement, **placeholder** (rect sombre
  semi-opaque) pour éviter de re-cacher le filtre à chaque `pointermove` ; au `pointerup`,
  `renderAnnotations` crée la vraie tuile pixelisée et cachée.
- `setTool` (liste blanche + `mosaic`), `makeDescriptor`, `makeNode`, `applyDescriptor`
  (placeholder pendant draft), `isDegenerate` étendus. Sélection mosaïque = `enabledAnchors([])`
  (déplacement seul).
- Fonction pure **`mosaicCrop(descriptor, scale)`** (calcul du `crop` en pixels source) →
  module `src/editor/mosaic.js`, **testée `node:test`**.

## 4. Export & échelle
- `cropX/cropY` et `crop.width/height` sont en **pixels physiques de la capture**
  (zone × `scale`). À l'export (`stage.toCanvas({pixelRatio: scale})`), le nœud caché est
  redessiné depuis son cache → reste **bien pixelisé** (blocs nets).

## 5. Tests
- `mosaicCrop` (pur) → `node:test` (ajouté à la CI). Le rendu pixelisé = **vérif GUI
  manuelle** (masquer une zone de texte, vérifier qu'il devient illisible, et que Copy/Save
  contiennent bien la mosaïque).

## 6. Critère d'acceptation
Sur le `.app` release : poser une mosaïque sur une zone de texte → texte illisible ;
déplacer/supprimer ; undo/redo ; Copy/Save contiennent la mosaïque. macOS + Windows,
CI verte.

## 7. Reporté
Flou gaussien, intensité réglable, mosaïque à main levée, redimensionnement des tuiles.
