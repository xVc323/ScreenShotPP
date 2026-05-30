# Palier 2c — Bulles numérotées — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Outil Bulle numérotée : clic = pastille auto-incrémentée, double-clic = cartouche de texte relié, renumérotation auto à la suppression, intégré à l'undo/redo et à l'export.

**Architecture:** Descripteur compound `bubble` rendu en `Konva.Group`. Numéro dérivé via la fonction pure `bubbleNumberAt` (testée). Saisie de label via `openTextEditor` généralisé.

**Base :** `src/editor/editor.js` gère rect/ellipse/line/arrow/free/text. `src/overlay.*` portent la barre. `FONT_FAMILY="Arial"`. Saisie texte 2b : `openTextEditor(point)` + `commitText()`.

Branche : `palier-2c-bulles`.

---

## Task 1: fonction pure `bubbleNumberAt` (TDD)

**Files:** Create `src/editor/bubbles.js`, `src/editor/bubbles.test.js`

- [ ] **Step 1: tests `src/editor/bubbles.test.js`**
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { bubbleNumberAt } from "./bubbles.js";

const A = [
  { type: "rect" },
  { type: "bubble" },
  { type: "arrow" },
  { type: "bubble" },
  { type: "bubble" },
];

test("rang 1-based parmi les bulles", () => {
  assert.equal(bubbleNumberAt(A, 1), 1);
  assert.equal(bubbleNumberAt(A, 3), 2);
  assert.equal(bubbleNumberAt(A, 4), 3);
});

test("null si l'index n'est pas une bulle", () => {
  assert.equal(bubbleNumberAt(A, 0), null);
  assert.equal(bubbleNumberAt(A, 2), null);
});

test("renumérotation après suppression simulée", () => {
  const B = A.filter((_, i) => i !== 1); // retire la 1re bulle
  // B = [rect, arrow, bubble, bubble]
  assert.equal(bubbleNumberAt(B, 2), 1);
  assert.equal(bubbleNumberAt(B, 3), 2);
});
```

- [ ] **Step 2: lancer → échec**
```bash
cd /Users/you/ScreenShotPP && node --test src/editor/bubbles.test.js 2>&1 | tail -8
```

- [ ] **Step 3: implémenter `src/editor/bubbles.js`**
```js
/** Rang 1-based de la bulle à `index` parmi toutes les bulles, ou null si pas une bulle. */
export function bubbleNumberAt(annotations, index) {
  if (annotations[index]?.type !== "bubble") return null;
  let n = 0;
  for (let i = 0; i <= index; i++) if (annotations[i].type === "bubble") n += 1;
  return n;
}
```

- [ ] **Step 4: lancer → succès** (`# pass 3`) puis **commit**
```bash
node --test src/editor/bubbles.test.js 2>&1 | grep -E "# (pass|fail)"
git add -A && git commit -m "feat: pure bubbleNumberAt with node:test coverage"
```

---

## Task 2: `editor.js` — outil bulle (pose, rendu, double-clic, drag, renumérotation)

**Files:** Modify `src/editor/editor.js`

- [ ] **Step 1: imports + constantes**
Importer `bubbleNumberAt` depuis `./bubbles.js`. Ajouter en tête de `createEditor` des constantes :
`const BUBBLE_RADIUS = 15;`, `const BUBBLE_FONT = 16;`, `const LABEL_OFFSET = { dx: 0, dy: -64 };`.

- [ ] **Step 2: `setTool` accepte `bubble`** (ajouter à la liste blanche). Après la boucle
de `draggable` des enfants directs, ajouter : `shapeGroup.find(".label").forEach((node) => node.draggable(tool === "select"));`.

- [ ] **Step 3: `pointerdown` — pose au clic**
Après la branche `tool === "text"`, ajouter :
```js
    if (tool === "bubble") {
      if (insideSelection(point)) {
        annotations.push({ id: `annotation-${nextId++}`, type: "bubble", x: point.x, y: point.y, color, label: "", labelOffset: null });
        renderAnnotations();
        saveHistory();
      }
      return;
    }
```
(`point = clampToSelection(point)` n'est pas requis : `insideSelection` garantit l'intérieur ; utiliser `point` tel quel.)

- [ ] **Step 4: `renderAnnotations` — calcul du numéro + délégation**
Brancher le rendu des bulles :
```js
    annotations.forEach((descriptor, index) => {
      let node;
      if (descriptor.type === "bubble") {
        node = makeBubbleNode(descriptor, bubbleNumberAt(annotations, index));
        shapeGroup.add(node);
      } else {
        node = makeNode(descriptor);
        bindShape(node);
        shapeGroup.add(node);
      }
      const number = Number(String(descriptor.id).replace("annotation-", ""));
      if (Number.isFinite(number)) nextId = Math.max(nextId, number + 1);
    });
```

- [ ] **Step 5: `makeBubbleNode(descriptor, number)`** (nouvelle fonction)
```js
  function makeBubbleNode(descriptor, number) {
    const group = new Konva.Group({ id: descriptor.id, x: descriptor.x, y: descriptor.y, draggable: tool === "select" });
    group.add(new Konva.Circle({ radius: BUBBLE_RADIUS, fill: descriptor.color }));
    group.add(new Konva.Text({
      text: String(number ?? "?"), fontSize: BUBBLE_FONT, fontStyle: "bold", fill: "#fff",
      fontFamily: FONT_FAMILY, width: BUBBLE_RADIUS * 2, height: BUBBLE_RADIUS * 2,
      align: "center", verticalAlign: "middle", x: -BUBBLE_RADIUS, y: -BUBBLE_RADIUS, listening: false,
    }));

    if (descriptor.label && descriptor.label.trim()) {
      const off = descriptor.labelOffset || LABEL_OFFSET;
      const connector = new Konva.Line({ points: [off.dx, off.dy, 0, 0], stroke: descriptor.color, strokeWidth: 2 });
      group.add(connector);
      const labelGroup = new Konva.Group({ x: off.dx, y: off.dy, draggable: tool === "select", name: "label" });
      const labelText = new Konva.Text({ text: descriptor.label, fontSize: 14, fill: "#e6edf3", fontFamily: FONT_FAMILY });
      const tw = labelText.width();
      const th = labelText.height();
      const pad = 6;
      labelGroup.add(new Konva.Rect({ x: -tw / 2 - pad, y: -th / 2 - pad, width: tw + pad * 2, height: th + pad * 2, fill: "#0d1117", stroke: descriptor.color, strokeWidth: 2, cornerRadius: 5 }));
      labelText.position({ x: -tw / 2, y: -th / 2 });
      labelGroup.add(labelText);
      group.add(labelGroup);
      labelGroup.on("dragmove", () => connector.points([labelGroup.x(), labelGroup.y(), 0, 0]));
      labelGroup.on("dragend", (e) => {
        if (e.target !== labelGroup) return;
        descriptor.labelOffset = { dx: labelGroup.x(), dy: labelGroup.y() };
        saveHistory();
      });
    }

    group.on("click tap", (e) => {
      if (tool !== "select") return;
      e.cancelBubble = true;
      selectNode(group);
    });
    group.on("dragend", (e) => {
      if (e.target !== group) return;
      descriptor.x = group.x();
      descriptor.y = group.y();
      saveHistory();
    });
    group.on("dblclick dbltap", (e) => {
      e.cancelBubble = true;
      openLabelEditor(descriptor, group);
    });
    return group;
  }
```

- [ ] **Step 6: généraliser la saisie + `openLabelEditor`**
Modifier `openTextEditor` pour accepter des options et stocker `onCommit`/`initial` ; modifier
`commitText` pour appeler `onCommit(text)` s'il existe (sinon créer une annotation `text`
comme aujourd'hui) ; préremplir le textarea avec `initial`. Ajouter :
```js
  function openLabelEditor(descriptor, group) {
    const abs = group.getAbsolutePosition();
    const off = descriptor.labelOffset || LABEL_OFFSET;
    openTextEditor({ x: abs.x + off.dx, y: abs.y + off.dy }, {
      initial: descriptor.label || "",
      onCommit: (text) => {
        descriptor.label = text;
        if (!descriptor.labelOffset) descriptor.labelOffset = { ...LABEL_OFFSET };
        renderAnnotations();
        saveHistory();
      },
    });
  }
```
Détails de `openTextEditor(point, options = {})` : `const initial = options.initial || ""`,
`textarea.value = initial`, `activeText = { textarea, point, onCommit: options.onCommit }`.
Détails de `commitText` : après `const text = value.replace(/\s+$/u, "")`, si
`onCommit` → `onCommit(text); return;` ; sinon comportement actuel (créer `text` si non vide).

- [ ] **Step 7: syntaxe + commit**
```bash
node --check src/editor/editor.js && echo OK
git add -A && git commit -m "feat: numbered bubble tool (click to place, double-click label, drag, auto-renumber)"
```

---

## Task 3: barre d'outils — bouton Bulle

**Files:** Modify `src/overlay.html`

- [ ] **Step 1:** ajouter après le bouton `text` :
```html
      <button class="tool" data-tool="bubble" title="Numbered bubble">①</button>
```
- [ ] **Step 2: syntaxe (html ok) + commit**
```bash
git add -A && git commit -m "feat: numbered bubble toolbar button"
```

---

## Task 4: CI — inclure les tests bulles

**Files:** Modify `.github/workflows/ci.yml`

- [ ] **Step 1:** étendre la commande node :
`run: node --test src/editor/history.test.js src/editor/color.test.js src/editor/bubbles.test.js`
- [ ] **Step 2:** vérifier localement (`# pass`), commit.

---

## Task 5: build release + vérification GUI

- [ ] **Step 1:** `npm run tauri build`, tuer les instances, `open` une seule `.app`.
- [ ] **Step 2: vérif manuelle** : poser plusieurs bulles (1,2,3 croissants), double-clic →
cartouche (trait relié), déplacer bulle (cartouche suit) et cartouche seul (trait suit),
supprimer une bulle du milieu (renumérotation), undo/redo, Copy/Save fusionnent bulles +
cartouches (PNG+JPEG), Cancel/Échap.
- [ ] **Step 3:** corriger les bugs (débogage méthodique), recompiler, retester.

## Critère d'acceptation
Voir `docs/superpowers/specs/2026-05-30-palier2c-bulles-numerotees-design.md` §6.

## Reporté
Palier 3 (OCR + mosaïque), Palier 4 (réglages + installateurs).
