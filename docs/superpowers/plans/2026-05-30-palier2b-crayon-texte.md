# Palier 2b — Crayon + Texte — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ajouter les outils Crayon (dessin libre) et Texte (saisie sur place) à l'éditeur d'annotation Konva, réutilisant l'infrastructure 2a (sélection, historique, export composé).

**Architecture:** Étendre `src/editor/editor.js` aux types de descripteur `free` (Konva.Line lissée, points ajoutés au pointermove) et `text` (Konva.Text créé via un `<textarea>` HTML temporaire géré par l'éditeur). Ajouter à la barre les boutons Crayon/Texte + un sélecteur de taille de police, câblés sur `editor.setFontSize`.

**Tech Stack:** Konva.js (vendorisé), Vanilla JS modules, Tauri v2 (inchangé côté Rust).

**Base :** `src/editor/editor.js` gère déjà rect/ellipse/line/arrow (descripteurs, makeNode, applyDescriptor, syncDescriptorFromNode, isDegenerate, sélection, clip, export). `src/overlay.html/css/js` portent la barre d'outils (tools `.tool[data-tool]`, swatches, `#thickness`, undo/redo/copy/save/cancel, poignée de drag).

Branche : `palier-2b-crayon-texte`.

---

## Task 1: `editor.js` — support du dessin libre (`free`) et du texte (`text`)

**Files:** Modify `src/editor/editor.js`

- [ ] **Step 1: État + constante police**
Ajouter une constante `FONT_FAMILY = "Arial"`, un état `let fontSize = positiveNumber(o.fontSize, 24);`, et accepter `free`/`text` dans `setTool` (liste blanche). Exposer `setFontSize(value){ fontSize = positiveNumber(value, fontSize); }` dans l'objet retourné.

- [ ] **Step 2: `makeDescriptor` — types `free` et `text`**
`free` : `{ ...common, type:"free", points:[point.x, point.y] }`.
`text` : géré hors de `makeDescriptor` (voir Step 5, flux textarea).

- [ ] **Step 3: dessin libre — `pointerdown`/`pointermove`/`pointerup`**
- `pointerdown` (outil `free`, dans la sélection) : créer le descripteur `free`, son node, l'ajouter à `shapeGroup`, le garder comme `annotationDraft`.
- `pointermove` (draft `free`) : **ajouter** le point courant clampé (`clampToSelection`) à `descriptor.points`, puis `applyDescriptor`. (Cas distinct de la logique from/to des autres formes.)
- `pointerup` : commit normal (rejet si dégénéré via `isDegenerate`).

- [ ] **Step 4: `makeNode` / `applyDescriptor` / `syncDescriptorFromNode` / `isDegenerate` pour `free`**
- `makeNode` : `new Konva.Line({ ...common, points, tension:0.4, lineCap:"round", lineJoin:"round" })`.
- `applyDescriptor` : `node.setAttrs({ points: descriptor.points })` (et x/y inchangés).
- `syncDescriptorFromNode` (après drag) : appliquer l'offset `node.x()/y()` aux points puis remettre la position à 0 (comme line/arrow). Réutiliser/мutualiser la branche line/arrow.
- `isDegenerate` : longueur cumulée des segments < `MIN_SIZE` (ou < 2 points).

- [ ] **Step 5: texte — flux `<textarea>` sur place**
- `pointerdown` (outil `text`, dans la sélection) : appeler `openTextEditor(point)` et **return** (pas de draft).
- `openTextEditor(point)` :
  - créer un `<textarea>` ; le styler en position absolue à `point` (coordonnées CSS = stage), `color:` couleur courante, `font: ${fontSize}px ${FONT_FAMILY}`, fond transparent, sans bordure, `white-space:pre`, auto-resize simple ; l'ajouter au `document.body` ; `focus()`.
  - garder une référence `activeText = { textarea, point }`.
  - validations : `blur`, touche `Escape`, `Cmd/Ctrl+Enter` → `commitText()`. `Enter` seul = saut de ligne (comportement natif du textarea).
- `commitText()` : lire la valeur ; retirer le textarea ; `activeText = null`. Si non vide : ajouter descripteur `{ id, type:"text", x:point.x, y:point.y, text, fill: color, fontSize }`, `renderAnnotations()`, `saveHistory()`.
- `makeNode` (`text`) : `new Konva.Text({ id, x, y, text, fill: descriptor.fill, fontSize: descriptor.fontSize, fontFamily: FONT_FAMILY, draggable: tool==="select" })`.
- `applyDescriptor`/`syncDescriptorFromNode` (`text`) : x/y (+ texte/fontSize inchangés au sync ; pas de resize).
- `isDegenerate` (`text`) : `!descriptor.text || descriptor.text.trim() === ""`.
- sélection/anchors : `text` et `free` → `transformer.enabledAnchors([])` (déplacement seul).

- [ ] **Step 6: valider le texte en cours avant les actions globales**
Appeler `commitText()` au début de `exportPngBase64()`, `undo()`, `redo()`, et dans `cancelDraft()`/`destroy()` (pour ne pas perdre une saisie ou laisser un textarea orphelin).

- [ ] **Step 7: vérifier la syntaxe + commit**
```bash
cd /Users/you/ScreenShotPP
node --check src/editor/editor.js && echo OK
git add -A && git commit -m "feat: freehand and text tools in the Konva editor"
```

---

## Task 2: barre d'outils — boutons Crayon/Texte + taille de police

**Files:** Modify `src/overlay.html`, `src/overlay.css`, `src/overlay.js`

- [ ] **Step 1: `overlay.html`** — ajouter après le bouton `arrow` :
```html
      <button class="tool" data-tool="free" title="Pencil">✎</button>
      <button class="tool" data-tool="text" title="Text">A</button>
```
et, près du `#thickness`, un sélecteur de taille :
```html
      <select id="fontsize" title="Text size">
        <option value="16">16</option>
        <option value="24" selected>24</option>
        <option value="32">32</option>
        <option value="48">48</option>
      </select>
```

- [ ] **Step 2: `overlay.css`** — (réutilise les styles `.tool`/`select` existants ; rien d'obligatoire, ajuster si besoin).

- [ ] **Step 3: `overlay.js`** — passer `fontSize` initial à `createEditor` (`fontSize: parseInt(fontsize.value,10)`) et câbler le `<select>` :
```js
const fontsize = document.getElementById("fontsize");
fontsize.addEventListener("change", (event) => {
  if (!editor) return;
  editor.setFontSize(parseInt(event.target.value, 10));
});
```

- [ ] **Step 4: syntaxe + commit**
```bash
node --check src/overlay.js && echo OK
git add -A && git commit -m "feat: pencil/text toolbar buttons and font-size selector"
```

---

## Task 3: build release + vérification GUI

- [ ] **Step 1:** `npm run tauri build`, tuer les instances, `open` une seule `.app`.
- [ ] **Step 2: vérif manuelle** : crayon (couleur/épaisseur, tracé fluide), texte sur place (couleur/taille, multi-ligne, validation blur/Échap/⌘Entrée, annulation si vide), déplacement/suppression, undo/redo, Copy/Save fusionnent crayon+texte (PNG+JPEG), Cancel/Échap.
- [ ] **Step 3:** corriger les bugs éventuels (débogage méthodique), recompiler, retester.

## Critère d'acceptation
Voir `docs/superpowers/specs/2026-05-30-palier2b-crayon-texte-design.md` §7.

## Reporté
Bulles numérotées (2c), redimensionnement/ré-édition du texte, OCR/mosaïque (Palier 3).
