# Palier 2a — Éditeur d'annotation : fondation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à l'overlay un éditeur d'annotation Konva.js (formes simples + couleur/épaisseur + déplacer/redimensionner/supprimer + undo/redo), et faire produire l'image finale (capture + annotations) par le frontend, Rust ne recevant que les octets PNG à copier/enregistrer.

**Architecture:** Stage Konva à 3 calques (fond capture / annotations clippées à la sélection / voile). Modèle frontend = tableau de descripteurs de formes ; historique pur testé via `node:test` ; rendu Konva séparé. Export via `stage.toCanvas({crop, pixelRatio})`. Rust gagne `copy_composited`/`save_composited` (décodent un PNG base64) et perd les commandes `rect` du Palier 1.

**Tech Stack:** Tauri v2 / Rust (`image`, `base64`), Konva.js vendorisé (global, sans bundler), frontend Vanilla JS (modules ES), Node 22 `node:test`.

**Base de départ (master, Palier 1) :**
- `src/overlay.html` (img#shot, canvas#dim, boutons copy/save/cancel), `src/overlay.js` (sélection + commandes rect), `src/overlay.css`.
- `src-tauri/src/commands.rs` : `start_capture`, `get_capture_data_url`, `copy_selection(rect)`, `save_selection(rect,path,format)`, `default_save_name`, `cancel_capture`, `CaptureState`.
- `src-tauri/src/storage.rs` : `SaveFormat`, `encode_image`, `encode_png_fast`, `current_filename`, `write_to_disk`.
- `src-tauri/src/clipboard.rs` : `copy_image(&AppHandle, &RgbaImage)`.
- `tauri.conf.json` : `withGlobalTauri: true`, `frontendDist: "../src"`.

---

## Structure des fichiers (cible)

```
src/
├── vendor/konva.min.js        # CRÉÉ (vendorisé)
├── overlay.html               # MODIFIÉ (script konva + conteneur stage + outils)
├── overlay.css                # MODIFIÉ (barre d'outils)
├── overlay.js                 # MODIFIÉ (bootstrap editor + wiring)
└── editor/
    ├── history.js             # CRÉÉ (pur)
    ├── history.test.js        # CRÉÉ (node:test)
    └── editor.js              # CRÉÉ (Konva)
src-tauri/src/
├── storage.rs                 # MODIFIÉ (decode_png_to_rgba + test)
└── commands.rs                # MODIFIÉ (copy/save composited ; retire rect)
.github/workflows/ci.yml       # MODIFIÉ (job node --test)
```

Travailler sur une branche dédiée `palier-2a-editeur` (le contrôleur la crée avant la Tâche 1).

---

## Task 1: Vendoriser Konva.js

**Files:** Create `src/vendor/konva.min.js`; Modify `src/overlay.html`

- [ ] **Step 1: Récupérer le build UMD de Konva**

```bash
cd /Users/you/ScreenShotPP
npm install konva
mkdir -p src/vendor
cp node_modules/konva/konva.min.js src/vendor/konva.min.js
test -s src/vendor/konva.min.js && echo "OK konva vendorisé"
```
Expected: `OK konva vendorisé`. (`node_modules/` est gitignored ; `src/vendor/konva.min.js` sera commité.)

- [ ] **Step 2: Charger Konva dans `src/overlay.html`**

Dans `src/overlay.html`, ajouter le script **classique** (avant le module) dans le `<head>` ou avant `overlay.js` :
```html
    <script src="vendor/konva.min.js"></script>
```
Il doit se charger AVANT `<script type="module" src="overlay.js">` (les scripts classiques s'exécutent avant les modules différés → le global `Konva` sera prêt).

- [ ] **Step 3: Commit**

```bash
cd /Users/you/ScreenShotPP
git add -A
git commit -m "chore: vendor Konva.js for the annotation editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Rust — `storage::decode_png_to_rgba` (TDD)

**Files:** Modify `src-tauri/src/storage.rs`

- [ ] **Step 1: Écrire le test (round-trip)**

Dans le bloc `#[cfg(test)] mod tests` de `src-tauri/src/storage.rs`, ajouter :
```rust
    #[test]
    fn png_round_trip_preserves_dimensions_and_pixels() {
        let mut img = RgbaImage::from_pixel(6, 4, image::Rgba([0, 0, 0, 255]));
        img.put_pixel(0, 0, image::Rgba([12, 34, 56, 255]));
        let png = encode_image(&img, SaveFormat::Png).unwrap();
        let back = decode_png_to_rgba(&png).unwrap();
        assert_eq!(back.dimensions(), (6, 4));
        assert_eq!(*back.get_pixel(0, 0), image::Rgba([12, 34, 56, 255]));
    }
```

- [ ] **Step 2: Lancer le test → échec (fonction absente)**

```bash
cargo test --manifest-path src-tauri/Cargo.toml storage::tests::png_round_trip 2>&1 | tail -15
```
Expected: erreur de compilation `cannot find function decode_png_to_rgba`.

- [ ] **Step 3: Implémenter `decode_png_to_rgba`**

Dans `src-tauri/src/storage.rs` (à côté de `encode_image`), ajouter :
```rust
/// Décode des octets PNG en image RGBA.
pub fn decode_png_to_rgba(png: &[u8]) -> Result<RgbaImage, String> {
    image::load_from_memory_with_format(png, ImageFormat::Png)
        .map_err(|e| e.to_string())
        .map(|img| img.to_rgba8())
}
```

- [ ] **Step 4: Lancer le test → succès**

```bash
cargo test --manifest-path src-tauri/Cargo.toml storage:: 2>&1 | tail -6
```
Expected: tous les tests storage passent (dont le nouveau).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: storage::decode_png_to_rgba with round-trip test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Rust — commandes `copy_composited` / `save_composited`

**Files:** Modify `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Ajouter les deux commandes dans `src-tauri/src/commands.rs`**

Ajouter (les imports `base64::Engine`, `storage`, `clipboard`, `AppHandle` existent déjà ;
ajouter ce qui manque) :
```rust
/// Copie une image déjà composée (PNG base64) dans le presse-papier.
#[tauri::command]
pub fn copy_composited(app: AppHandle, png_base64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;
    let img = storage::decode_png_to_rgba(&bytes)?;
    clipboard::copy_image(&app, &img)?;
    close_overlay(&app);
    Ok(())
}

/// Enregistre une image déjà composée (PNG base64) au format/chemin choisis.
#[tauri::command]
pub fn save_composited(
    app: AppHandle,
    png_base64: String,
    path: String,
    format: String,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;
    let img = storage::decode_png_to_rgba(&bytes)?;
    let fmt = storage::SaveFormat::from_str(&format);
    let out = storage::encode_image(&img, fmt)?;
    storage::write_to_disk(&path, &out)?;
    close_overlay(&app);
    Ok(())
}
```

- [ ] **Step 2: Retirer les commandes `rect` du Palier 1**

Dans `src-tauri/src/commands.rs`, **supprimer** les fonctions `copy_selection` et
`save_selection` (basées sur `rect`) ainsi que le helper `with_cropped` (devenu inutilisé).
Garder `start_capture`, `get_capture_data_url`, `default_save_name`, `cancel_capture`,
`close_overlay`, `CaptureState`. (Le module `capture` et `crop_region` restent, non utilisés.)

- [ ] **Step 3: Mettre à jour le `invoke_handler` dans `src-tauri/src/lib.rs`**

Remplacer les entrées `commands::copy_selection, commands::save_selection` par
`commands::copy_composited, commands::save_composited`. Résultat :
```rust
        .invoke_handler(tauri::generate_handler![
            commands::get_capture_data_url,
            commands::copy_composited,
            commands::save_composited,
            commands::default_save_name,
            commands::cancel_capture,
        ])
```

- [ ] **Step 4: Vérifier la compilation**

```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20
```
Expected: compile (un warning `crop_region`/`capture` inutilisé est acceptable).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: composited copy/save commands; drop rect-based commands

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — module historique pur (TDD `node:test`)

**Files:** Create `src/editor/history.js`, `src/editor/history.test.js`

- [ ] **Step 1: Écrire les tests `src/editor/history.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { History } from "./history.js";

test("commence vide, pas d'undo/redo", () => {
  const h = new History();
  assert.deepEqual(h.current(), []);
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
});

test("push active l'undo et change l'état courant", () => {
  const h = new History();
  h.push([{ id: 1 }]);
  assert.equal(h.canUndo(), true);
  assert.deepEqual(h.current(), [{ id: 1 }]);
});

test("undo puis redo parcourent l'historique", () => {
  const h = new History();
  h.push([{ id: 1 }]);
  h.push([{ id: 1 }, { id: 2 }]);
  assert.deepEqual(h.undo(), [{ id: 1 }]);
  assert.equal(h.canRedo(), true);
  assert.deepEqual(h.redo(), [{ id: 1 }, { id: 2 }]);
});

test("push après undo tronque le redo", () => {
  const h = new History();
  h.push([{ id: 1 }]);
  h.push([{ id: 1 }, { id: 2 }]);
  h.undo();
  h.push([{ id: 1 }, { id: 3 }]);
  assert.equal(h.canRedo(), false);
  assert.deepEqual(h.current(), [{ id: 1 }, { id: 3 }]);
});

test("les snapshots sont isolés (pas d'aliasing)", () => {
  const h = new History();
  const a = [{ id: 1 }];
  h.push(a);
  a[0].id = 999;
  assert.deepEqual(h.current(), [{ id: 1 }]);
});
```

- [ ] **Step 2: Lancer → échec (module absent)**

```bash
cd /Users/you/ScreenShotPP
node --test src/editor/history.test.js 2>&1 | tail -15
```
Expected: échec (impossible de charger `./history.js`).

- [ ] **Step 3: Implémenter `src/editor/history.js`**

```js
/** Pile d'undo/redo de snapshots (tableaux de descripteurs de formes). */
export class History {
  constructor() {
    this.stack = [[]]; // état initial : aucune annotation
    this.index = 0;
  }
  current() {
    return structuredClone(this.stack[this.index]);
  }
  push(snapshot) {
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(structuredClone(snapshot));
    this.index = this.stack.length - 1;
  }
  canUndo() {
    return this.index > 0;
  }
  canRedo() {
    return this.index < this.stack.length - 1;
  }
  undo() {
    if (this.canUndo()) this.index -= 1;
    return this.current();
  }
  redo() {
    if (this.canRedo()) this.index += 1;
    return this.current();
  }
}
```

- [ ] **Step 4: Lancer → succès**

```bash
node --test src/editor/history.test.js 2>&1 | tail -10
```
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pure undo/redo history module with node:test coverage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Frontend — l'éditeur Konva (`src/editor/editor.js`)

**Files:** Create `src/editor/editor.js`

> Tâche d'intégration la plus lourde. Le code ci-dessous est une implémentation de
> référence complète et fonctionnelle ; si une API Konva diffère dans la version installée,
> l'adapter de façon minimale (consulter https://konvajs.org/api/Konva.html) en conservant
> le comportement décrit. Konva est disponible en global (`window.Konva`).

- [ ] **Step 1: Créer `src/editor/editor.js`**

```js
import { History } from "./history.js";

let _idCounter = 0;
const nextId = () => `s${++_idCounter}`;
const KONVA_CLASS = { rect: "Rect", ellipse: "Ellipse", line: "Line", arrow: "Arrow" };

/**
 * Crée l'éditeur d'annotation.
 * @param {Object} o
 * @param {HTMLElement} o.container conteneur plein écran du stage
 * @param {HTMLImageElement} o.image capture chargée (naturalWidth = px physiques)
 * @param {number} o.scale px physiques par px CSS
 * @param {Function} o.onSelectionDone () => void  appelé quand la sélection est figée
 * @param {Function} o.onHistoryChange ({canUndo,canRedo}) => void
 */
export function createEditor(o) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const stage = new Konva.Stage({ container: o.container, width: W, height: H });
  const bgLayer = new Konva.Layer({ listening: false });
  const annoLayer = new Konva.Layer();
  const dimLayer = new Konva.Layer({ listening: false });
  stage.add(bgLayer, annoLayer, dimLayer);

  bgLayer.add(new Konva.Image({ image: o.image, x: 0, y: 0, width: W, height: H }));
  bgLayer.draw();

  const dimRects = [0, 1, 2, 3].map(() => {
    const r = new Konva.Rect({ fill: "rgba(0,0,0,0.45)", visible: false });
    dimLayer.add(r);
    return r;
  });
  const selBorder = new Konva.Rect({ stroke: "#4da3ff", strokeWidth: 2, visible: false });
  dimLayer.add(selBorder);

  const tr = new Konva.Transformer({ rotateEnabled: false, ignoreStroke: true, visible: false });
  annoLayer.add(tr);

  let phase = "selecting";
  let selection = null;            // {x,y,w,h} en px CSS
  let tool = "select";
  let color = "#e5484d";
  let strokeWidth = 4;
  let annotations = [];            // descripteurs (source de vérité)
  const history = new History();
  let draftId = null;              // id de la forme en cours de tracé
  let startPt = null;

  const emit = () =>
    o.onHistoryChange && o.onHistoryChange({ canUndo: history.canUndo(), canRedo: history.canRedo() });

  // ---------- voile ----------
  function updateDim() {
    if (!selection) {
      dimRects.forEach((r) => r.visible(false));
      selBorder.visible(false);
      dimLayer.batchDraw();
      return;
    }
    const { x, y, w, h } = selection;
    dimRects[0].setAttrs({ x: 0, y: 0, width: W, height: y, visible: true });
    dimRects[1].setAttrs({ x: 0, y: y + h, width: W, height: H - (y + h), visible: true });
    dimRects[2].setAttrs({ x: 0, y, width: x, height: h, visible: true });
    dimRects[3].setAttrs({ x: x + w, y, width: W - (x + w), height: h, visible: true });
    selBorder.setAttrs({ x, y, width: w, height: h, visible: true });
    dimLayer.batchDraw();
  }

  // ---------- rendu des annotations depuis les descripteurs ----------
  function attrsFor(d) {
    const base = { id: d.id, stroke: d.stroke, strokeWidth: d.strokeWidth, draggable: tool === "select" };
    if (d.type === "rect") return { ...base, x: d.x, y: d.y, width: d.width, height: d.height };
    if (d.type === "ellipse")
      return { ...base, x: d.x, y: d.y, radiusX: Math.max(1, d.radiusX), radiusY: Math.max(1, d.radiusY) };
    if (d.type === "line") return { ...base, points: d.points, lineCap: "round" };
    // arrow
    return {
      ...base,
      points: d.points,
      lineCap: "round",
      fill: d.stroke,
      pointerLength: 8 + d.strokeWidth,
      pointerWidth: 8 + d.strokeWidth,
    };
  }

  function makeNode(d) {
    const node = new Konva[KONVA_CLASS[d.type]](attrsFor(d));
    node.on("dragend transformend", () => {
      normalizeAndStore(node);
      commit();
    });
    return node;
  }

  function renderAnnotations() {
    annoLayer.getChildren((n) => n !== tr).forEach((n) => n.destroy());
    tr.nodes([]);
    tr.visible(false);
    annotations.forEach((d) => annoLayer.add(makeNode(d)));
    annoLayer.batchDraw();
  }

  // écrit la géométrie d'un node (après drag/resize) dans son descripteur
  function normalizeAndStore(node) {
    const d = annotations.find((a) => a.id === node.id());
    if (!d) return;
    const sx = node.scaleX();
    const sy = node.scaleY();
    if (d.type === "rect") {
      d.x = node.x();
      d.y = node.y();
      d.width = Math.max(1, node.width() * sx);
      d.height = Math.max(1, node.height() * sy);
    } else if (d.type === "ellipse") {
      d.x = node.x();
      d.y = node.y();
      d.radiusX = Math.max(1, node.radiusX() * sx);
      d.radiusY = Math.max(1, node.radiusY() * sy);
    } else {
      // line / arrow : appliquer le déplacement aux points puis remettre x/y à 0
      const pts = node.points().slice();
      const dx = node.x();
      const dy = node.y();
      d.points = pts.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
    }
    node.scaleX(1);
    node.scaleY(1);
    if (d.type === "line" || d.type === "arrow") {
      node.position({ x: 0, y: 0 });
      node.points(d.points);
    }
  }

  function commit() {
    history.push(annotations);
    emit();
  }

  // ---------- outils ----------
  function setTool(t) {
    tool = t;
    tr.nodes([]);
    tr.visible(false);
    // (re)rendre pour mettre à jour draggable selon l'outil
    renderAnnotations();
  }
  function setColor(c) {
    color = c;
  }
  function setStrokeWidth(w) {
    strokeWidth = w;
  }

  function pointer() {
    return stage.getPointerPosition();
  }
  function insideSelection(p) {
    if (!selection) return false;
    return (
      p.x >= selection.x &&
      p.x <= selection.x + selection.w &&
      p.y >= selection.y &&
      p.y <= selection.y + selection.h
    );
  }

  // ---------- interactions ----------
  stage.on("mousedown", () => {
    const p = pointer();
    if (phase === "selecting") {
      startPt = p;
      selection = { x: p.x, y: p.y, w: 0, h: 0 };
      return;
    }
    // phase annotating
    if (tool === "select") {
      const target = stage.getIntersection(p);
      if (target && target.getLayer() === annoLayer && target !== tr && KONVA_CLASS[annotations.find((a) => a.id === target.id())?.type]) {
        tr.nodes([target]);
        tr.enabledAnchors(
          ["rect", "ellipse"].includes(annotations.find((a) => a.id === target.id()).type)
            ? undefined
            : []
        );
        tr.visible(true);
        annoLayer.batchDraw();
      } else {
        tr.nodes([]);
        tr.visible(false);
        annoLayer.batchDraw();
      }
      return;
    }
    if (!insideSelection(p)) return;
    // créer une forme draft
    startPt = p;
    const id = nextId();
    draftId = id;
    let d;
    if (tool === "rect") d = { id, type: "rect", x: p.x, y: p.y, width: 1, height: 1, stroke: color, strokeWidth };
    else if (tool === "ellipse") d = { id, type: "ellipse", x: p.x, y: p.y, radiusX: 1, radiusY: 1, stroke: color, strokeWidth };
    else if (tool === "line") d = { id, type: "line", points: [p.x, p.y, p.x, p.y], stroke: color, strokeWidth };
    else d = { id, type: "arrow", points: [p.x, p.y, p.x, p.y], stroke: color, strokeWidth };
    annotations.push(d);
    annoLayer.add(makeNode(d));
    annoLayer.batchDraw();
  });

  stage.on("mousemove", () => {
    const p = pointer();
    if (phase === "selecting" && startPt) {
      selection = {
        x: Math.min(startPt.x, p.x),
        y: Math.min(startPt.y, p.y),
        w: Math.abs(p.x - startPt.x),
        h: Math.abs(p.y - startPt.y),
      };
      updateDim();
      return;
    }
    if (phase === "annotating" && draftId && startPt) {
      const d = annotations.find((a) => a.id === draftId);
      const cp = {
        x: Math.max(selection.x, Math.min(p.x, selection.x + selection.w)),
        y: Math.max(selection.y, Math.min(p.y, selection.y + selection.h)),
      };
      if (d.type === "rect") {
        d.x = Math.min(startPt.x, cp.x);
        d.y = Math.min(startPt.y, cp.y);
        d.width = Math.abs(cp.x - startPt.x);
        d.height = Math.abs(cp.y - startPt.y);
      } else if (d.type === "ellipse") {
        d.x = (startPt.x + cp.x) / 2;
        d.y = (startPt.y + cp.y) / 2;
        d.radiusX = Math.abs(cp.x - startPt.x) / 2;
        d.radiusY = Math.abs(cp.y - startPt.y) / 2;
      } else {
        d.points = [startPt.x, startPt.y, cp.x, cp.y];
      }
      const node = annoLayer.findOne(`#${draftId}`);
      if (node) node.setAttrs(attrsFor(d));
      annoLayer.batchDraw();
    }
  });

  stage.on("mouseup", () => {
    if (phase === "selecting" && startPt) {
      startPt = null;
      if (!selection || selection.w < 3 || selection.h < 3) {
        selection = null;
        updateDim();
        return;
      }
      phase = "annotating";
      // clippe annoLayer à la sélection
      annoLayer.clipFunc((ctx) => {
        ctx.rect(selection.x, selection.y, selection.w, selection.h);
      });
      updateDim();
      if (o.onSelectionDone) o.onSelectionDone();
      return;
    }
    if (phase === "annotating" && draftId) {
      const d = annotations.find((a) => a.id === draftId);
      draftId = null;
      startPt = null;
      // rejeter une forme dégénérée
      const tiny =
        (d.type === "rect" && (d.width < 2 || d.height < 2)) ||
        (d.type === "ellipse" && (d.radiusX < 2 || d.radiusY < 2)) ||
        ((d.type === "line" || d.type === "arrow") &&
          Math.hypot(d.points[2] - d.points[0], d.points[3] - d.points[1]) < 3);
      if (tiny) {
        annotations = annotations.filter((a) => a.id !== d.id);
        renderAnnotations();
        return;
      }
      commit();
    }
  });

  // suppression de la forme sélectionnée
  window.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && tr.nodes().length) {
      const ids = tr.nodes().map((n) => n.id());
      annotations = annotations.filter((a) => !ids.includes(a.id));
      renderAnnotations();
      commit();
    }
  });

  // ---------- undo/redo ----------
  function undo() {
    annotations = history.undo();
    renderAnnotations();
    emit();
  }
  function redo() {
    annotations = history.redo();
    renderAnnotations();
    emit();
  }

  // ---------- export ----------
  function exportPngBase64() {
    dimLayer.visible(false);
    const trWasVisible = tr.visible();
    tr.visible(false);
    annoLayer.batchDraw();
    const canvas = stage.toCanvas({
      x: selection.x,
      y: selection.y,
      width: selection.w,
      height: selection.h,
      pixelRatio: o.scale,
    });
    dimLayer.visible(true);
    tr.visible(trWasVisible);
    annoLayer.batchDraw();
    return canvas.toDataURL("image/png").split(",")[1];
  }

  function hasSelection() {
    return phase === "annotating" && !!selection;
  }

  return { setTool, setColor, setStrokeWidth, undo, redo, exportPngBase64, hasSelection };
}
```

- [ ] **Step 2: Vérifier la syntaxe du module avec Node**

```bash
cd /Users/you/ScreenShotPP
node --check src/editor/editor.js && echo "syntaxe OK"
```
Expected: `syntaxe OK`. (Le module référence `Konva` global au runtime — `node --check`
vérifie seulement la syntaxe, pas l'exécution.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: Konva annotation editor (shapes, transform, undo/redo, export)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Frontend — overlay (HTML/CSS/JS) câblé sur l'éditeur

**Files:** Modify `src/overlay.html`, `src/overlay.css`, `src/overlay.js`

- [ ] **Step 1: `src/overlay.html`**

Remplacer le `<body>` par (garder le `<script konva>` de la Tâche 1 dans le `<head>`) :
```html
  <body class="overlay-body">
    <div id="stage"></div>
    <div id="toolbar" class="toolbar hidden">
      <button class="tool" data-tool="select" title="Select/Move">▱</button>
      <button class="tool" data-tool="rect" title="Rectangle">▭</button>
      <button class="tool" data-tool="ellipse" title="Ellipse">◯</button>
      <button class="tool" data-tool="line" title="Line">╱</button>
      <button class="tool" data-tool="arrow" title="Arrow">↗</button>
      <span class="sep"></span>
      <button class="swatch" data-color="#e5484d" style="background:#e5484d"></button>
      <button class="swatch" data-color="#4da3ff" style="background:#4da3ff"></button>
      <button class="swatch" data-color="#3fb950" style="background:#3fb950"></button>
      <button class="swatch" data-color="#f2cc60" style="background:#f2cc60"></button>
      <button class="swatch" data-color="#ffffff" style="background:#ffffff"></button>
      <select id="thickness" title="Thickness">
        <option value="2">S</option>
        <option value="4" selected>M</option>
        <option value="8">L</option>
        <option value="14">XL</option>
      </select>
      <span class="sep"></span>
      <button id="undo" title="Undo">↶</button>
      <button id="redo" title="Redo">↷</button>
      <span class="sep"></span>
      <button id="copy-btn">Copy</button>
      <button id="save-btn">Save</button>
      <button id="cancel-btn">Cancel</button>
    </div>
    <script type="module" src="overlay.js"></script>
  </body>
```

- [ ] **Step 2: `src/overlay.css`** (remplacer le contenu)

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
.overlay-body { overflow: hidden; cursor: crosshair; user-select: none; background: #000; }
#stage { position: fixed; inset: 0; width: 100vw; height: 100vh; }
.toolbar {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px; padding: 7px 9px;
  background: #161b22; border: 1px solid #30363d; border-radius: 9px; z-index: 10;
}
.toolbar.hidden { display: none; }
.toolbar button, .toolbar select {
  background: #21262d; color: #e6edf3; border: 1px solid #30363d;
  border-radius: 6px; min-width: 30px; height: 30px; cursor: pointer; font-size: 14px;
}
.toolbar button.active { outline: 2px solid #4da3ff; }
.toolbar .swatch { width: 22px; min-width: 22px; height: 22px; border-radius: 50%; padding: 0; }
.toolbar .swatch.active { outline: 2px solid #fff; }
.toolbar #copy-btn, .toolbar #save-btn, .toolbar #cancel-btn { padding: 0 12px; }
.sep { width: 1px; height: 22px; background: #30363d; margin: 0 4px; }
```

- [ ] **Step 3: `src/overlay.js`** (remplacer le contenu)

```js
import { createEditor } from "./editor/editor.js";

const { invoke } = window.__TAURI__.core;
const dialog = window.__TAURI__.dialog;

const toolbar = document.getElementById("toolbar");
let editor = null;

(async function init() {
  const dataUrl = await invoke("get_capture_data_url");
  const image = new Image();
  image.onload = () => {
    const scale = image.naturalWidth / window.innerWidth;
    editor = createEditor({
      container: "stage",
      image,
      scale,
      onSelectionDone: () => toolbar.classList.remove("hidden"),
      onHistoryChange: ({ canUndo, canRedo }) => {
        document.getElementById("undo").disabled = !canUndo;
        document.getElementById("redo").disabled = !canRedo;
      },
    });
    setActiveTool("select");
  };
  image.src = dataUrl;
})();

function setActiveTool(t) {
  editor.setTool(t);
  document.querySelectorAll(".tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
}

document.querySelectorAll(".tool").forEach((b) =>
  b.addEventListener("click", () => setActiveTool(b.dataset.tool))
);
document.querySelectorAll(".swatch").forEach((b) =>
  b.addEventListener("click", () => {
    editor.setColor(b.dataset.color);
    document.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s === b));
  })
);
document.getElementById("thickness").addEventListener("change", (e) =>
  editor.setStrokeWidth(parseInt(e.target.value, 10))
);
document.getElementById("undo").addEventListener("click", () => editor.undo());
document.getElementById("redo").addEventListener("click", () => editor.redo());

async function doCopy() {
  try {
    if (!editor.hasSelection()) return;
    await invoke("copy_composited", { pngBase64: editor.exportPngBase64() });
  } catch (e) {
    console.error("Copy failed:", e);
    window.alert("Copy failed: " + e);
    await invoke("cancel_capture");
  }
}

document.getElementById("copy-btn").addEventListener("click", doCopy);
document.getElementById("cancel-btn").addEventListener("click", () => invoke("cancel_capture"));
document.getElementById("save-btn").addEventListener("click", async () => {
  try {
    if (!editor.hasSelection()) return;
    const suggested = await invoke("default_save_name", { format: "png" });
    const path = await dialog.save({
      defaultPath: suggested,
      filters: [
        { name: "PNG", extensions: ["png"] },
        { name: "JPEG", extensions: ["jpg", "jpeg"] },
      ],
    });
    if (!path) return;
    const lower = path.toLowerCase();
    const format = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg" : "png";
    await invoke("save_composited", { pngBase64: editor.exportPngBase64(), path, format });
  } catch (e) {
    console.error("Save failed:", e);
    window.alert("Save failed: " + e);
    await invoke("cancel_capture");
  }
});

window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") await invoke("cancel_capture");
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") await doCopy();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    editor && editor.undo();
  }
  if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
    e.preventDefault();
    editor && editor.redo();
  }
});
```

Note : la commande Rust attend `png_base64` ; en JS l'argument se nomme `pngBase64`
(Tauri convertit camelCase → snake_case automatiquement).

- [ ] **Step 4: Vérifier la syntaxe**

```bash
cd /Users/you/ScreenShotPP
node --check src/overlay.js && echo "overlay OK"
```
Expected: `overlay OK`.

- [ ] **Step 5: Compilation Rust (sanity)**

```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8
```
Expected: compile.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: annotation toolbar UI wired to Konva editor and composited copy/save

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: CI — ajouter les tests frontend `node --test`

**Files:** Modify `.github/workflows/ci.yml`

- [ ] **Step 1: Ajouter un step Node au job existant**

Dans `.github/workflows/ci.yml`, dans le job `test`, après le step des tests cargo, ajouter :
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Tests frontend (logique pure)
        run: node --test src/editor/history.test.js
```

- [ ] **Step 2: Vérifier localement**

```bash
cd /Users/you/ScreenShotPP
node --test src/editor/history.test.js 2>&1 | tail -5
```
Expected: `# pass 5 / # fail 0`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "ci: run frontend history tests on macOS and Windows

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Vérification GUI + build release

**Files:** aucun (vérification)

- [ ] **Step 1: Build release**

```bash
cd /Users/you/ScreenShotPP
npm run tauri build 2>&1 | tail -8
```
Expected: `.app` généré dans `src-tauri/target/release/bundle/macos/ScreenShotPP.app`.

- [ ] **Step 2: Vérification manuelle par l'humain** (le contrôleur lance le `.app` ; l'utilisateur teste)

S'assurer d'**une seule instance** (tuer les anciennes : `pkill -f ScreenShotPP`), puis
`open .../ScreenShotPP.app`. Tester :
1. ⌘⇧2 → sélectionner une zone (le voile + cadre apparaissent, la barre d'outils s'affiche).
2. Choisir **Rectangle**, une couleur, une épaisseur → dessiner dans la zone.
3. Idem **Rond**, **Droite**, **Flèche**.
4. **Select/Move** → cliquer une forme → la déplacer ; poignées pour redimensionner
   (rect/ellipse) ; **Suppr** la supprime.
5. **Undo/Redo** (boutons et ⌘Z / ⌘⇧Z) reviennent/rétablissent les formes.
6. **Copy** → coller ailleurs : l'image contient la zone **avec les annotations fusionnées**.
7. **Save** → PNG puis JPEG : fichiers corrects avec annotations.
8. **Cancel/Échap** ferme sans rien faire.

- [ ] **Step 3: (si bugs)** les corriger via le débogage méthodique, recompiler, retester.

---

## Critère d'acceptation 2a
Voir `docs/superpowers/specs/2026-05-30-palier2a-editeur-fondation-design.md` §8. Résumé :
dessiner/déplacer/supprimer les 4 formes, undo/redo, et copier/enregistrer une image où les
annotations sont fusionnées dans la sélection — vérifié sur le `.app` release, CI verte
(cargo + node) macOS/Windows.

## Volontairement reporté
Dessin libre + texte (2b), bulles numérotées (2c), mosaïque/OCR (Palier 3), réajustement de
la sélection, édition de la couleur d'une forme existante.
