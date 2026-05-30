# Palier 3b — Mosaïque — Implementation Plan

> Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Outil Mosaïque (pixelisation d'une zone du screenshot), intégré à l'éditeur (drag-rectangle, déplaçable, undo/redo, export).

**Base :** `editor.js` gère rect/ellipse/line/arrow/free/text/bubble. `o.image` = capture ; `o.scale` = px physiques / px CSS. Konva vendorisé inclut `Konva.Filters.Pixelate`.

Branche : `palier-3b-mosaique`.

---

## Task 1: fonction pure `mosaicCrop` (TDD)

**Files:** Create `src/editor/mosaic.js`, `src/editor/mosaic.test.js`

- [ ] **Step 1: tests** `src/editor/mosaic.test.js` :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mosaicCrop } from "./mosaic.js";

test("crop en pixels source à partir du descripteur et de l'échelle", () => {
  const d = { x: 10, y: 20, width: 30, height: 40, cropX: 20, cropY: 40 };
  assert.deepEqual(mosaicCrop(d, 2), { x: 20, y: 40, width: 60, height: 80 });
});

test("échelle 1 : crop = dimensions du descripteur", () => {
  const d = { x: 5, y: 6, width: 7, height: 8, cropX: 5, cropY: 6 };
  assert.deepEqual(mosaicCrop(d, 1), { x: 5, y: 6, width: 7, height: 8 });
});

test("dimensions arrondies", () => {
  const d = { x: 0, y: 0, width: 10.4, height: 10.6, cropX: 3.2, cropY: 3.8 };
  assert.deepEqual(mosaicCrop(d, 1.5), { x: 3, y: 4, width: 16, height: 16 });
});
```

- [ ] **Step 2: lancer → échec** (`node --test src/editor/mosaic.test.js`).

- [ ] **Step 3: implémenter** `src/editor/mosaic.js` :
```js
/** Recadrage source (pixels de la capture) d'une mosaïque, en fonction de l'échelle. */
export function mosaicCrop(descriptor, scale) {
  return {
    x: Math.round(descriptor.cropX),
    y: Math.round(descriptor.cropY),
    width: Math.round(descriptor.width * scale),
    height: Math.round(descriptor.height * scale),
  };
}
```

- [ ] **Step 4: lancer → succès** (`# pass 3`) ; **commit**.

---

## Task 2: `editor.js` — outil mosaïque

**Files:** Modify `src/editor/editor.js`

- [ ] **Step 1:** importer `mosaicCrop` depuis `./mosaic.js` ; constante `const MOSAIC_PIXEL = 16;`.

- [ ] **Step 2: `setTool`** liste blanche : ajouter `"mosaic"`.

- [ ] **Step 3: `makeDescriptor`** : `if (kind === "mosaic") return { ...common, x: point.x, y: point.y, width: 0, height: 0, cropX: 0, cropY: 0 };`
(la couleur/strokeWidth de `common` sont inoffensifs ; on ne les utilise pas pour la mosaïque.)

- [ ] **Step 4: `updateDraftDescriptor`** : traiter `mosaic` comme `rect`
(`Object.assign(descriptor, normalizedRect(...))`).

- [ ] **Step 5: `makeNode`** : ajouter une branche `mosaic`. Pendant le **draft** (pas encore
de `cropX/Y` figés) on rend un **placeholder** ; une fois committé, la vraie tuile.
Implémentation : décider via un drapeau `committed` sur le descripteur, ou plus simple — gérer
le draft avec un `Konva.Rect` placeholder dans le flux `pointerdown` mosaïque, et `makeNode`
ne gère que la mosaïque **committée** (avec cache). Approche retenue :
  - Dans `pointerdown` (outil `mosaic`, dans la sélection) : créer le descripteur via
    `makeDescriptor`, et un **node placeholder** `new Konva.Rect({ id, x, y, width:0, height:0,
    fill: "rgba(0,0,0,0.55)" })` comme `annotationDraft.node` (ne pas passer par `makeNode`).
  - `updateDraftDescriptor` (mosaic) met à jour x/y/width/height ; `applyDescriptor` (mosaic)
    applique `{x,y,width,height}` au rect placeholder.
  - Dans `finishPointer`, avant le push : si `descriptor.type === "mosaic"`, figer
    `descriptor.cropX = descriptor.x * scale ; descriptor.cropY = descriptor.y * scale` (avec
    `scale = positiveNumber(o.scale,1)`), détruire le placeholder, `annotations.push(clone)`,
    `renderAnnotations()`, `saveHistory()` (comme le flux normal).
  - `makeNode` (mosaic, committé) :
```js
    else if (descriptor.type === "mosaic") {
      const crop = mosaicCrop(descriptor, positiveNumber(o.scale, 1));
      node = new Konva.Image({
        id: descriptor.id, x: descriptor.x, y: descriptor.y,
        width: descriptor.width, height: descriptor.height,
        image: o.image, crop,
        draggable: tool === "select",
        filters: [Konva.Filters.Pixelate], pixelSize: MOSAIC_PIXEL,
      });
      node.cache();
    }
```

- [ ] **Step 6: `applyDescriptor`** : pour `mosaic` pendant le draft, le node est un Rect →
`node.setAttrs({ x, y, width, height })` (même branche que rect).

- [ ] **Step 7: `isDegenerate`** : `if (descriptor.type === "mosaic") return descriptor.width < MIN_SIZE || descriptor.height < MIN_SIZE;`

- [ ] **Step 8: sélection** : dans `selectNode`, la mosaïque (Konva.Image) tombe dans la
branche `else` (transformer sans poignées) → déplacement seul. OK sans changement, mais
vérifier que `getClassName() === "Image"` n'active pas les poignées de resize (la condition
actuelle n'active les ancres que pour `Rect`/`Ellipse`).

- [ ] **Step 9: syncDescriptorFromNode** (mosaic, après déplacement) : met à jour `x/y` ;
ne touche pas `cropX/cropY` (tampon figé). Ajouter une branche `else if (mosaic) { /* x,y déjà mis */ }`.

- [ ] **Step 10:** `node --check src/editor/editor.js` ; **commit**.

---

## Task 3: barre d'outils — bouton Mosaïque

**Files:** Modify `src/overlay.html`

- [ ] **Step 1:** après le bouton `bubble` :
```html
      <button class="tool" data-tool="mosaic" title="Mosaic blur">▦</button>
```
- [ ] **Step 2: commit.**

---

## Task 4: CI — inclure mosaic.test.js

**Files:** Modify `.github/workflows/ci.yml`

- [ ] **Step 1:** ajouter `src/editor/mosaic.test.js` à la commande `node --test`.
- [ ] **Step 2:** vérifier localement ; **commit**.

---

## Task 5: build release + vérification GUI
- [ ] `npm run tauri build` ; lancer la `.app` ; **⌘⇧2**, sélectionner, outil **Mosaic**,
glisser sur une zone de **texte** → le texte doit devenir **illisible (blocs)** ; déplacer ;
supprimer ; undo/redo ; **Copy/Save** → vérifier que la mosaïque est bien fusionnée. Corriger
au besoin.

## Critère d'acceptation
Voir `docs/superpowers/specs/2026-05-31-palier3b-mosaique-design.md` §6.

## Reporté
Flou, intensité réglable, mosaïque à main levée.
