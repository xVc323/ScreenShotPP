import { History } from "./history.js";
import { bubbleNumberAt, bubbleConnectorEnd } from "./bubbles.js";
import { isEditableTarget } from "../editable-target.js";
import { mosaicCrop } from "./mosaic.js";

const MIN_SIZE = 2;
const DRAG_THRESHOLD = 4;
const HANDLE_RADIUS = 5;
const HANDLE_HIT_STROKE = 16;
const MOSAIC_PIXEL = 16;
const FONT_FAMILY = "Arial";
const BUBBLE_RADIUS = 15;
const BUBBLE_FONT = 16;
const LABEL_OFFSET = { dx: 0, dy: -64 };
const RESIZE_ANCHORS = ["top-left", "top-center", "top-right", "middle-right", "bottom-right", "bottom-center", "bottom-left", "middle-left"];

/** Crée l'éditeur d'annotations Konva plein écran. */
export function createEditor(o = {}) {
  const Konva = window.Konva;
  if (!Konva) throw new Error("Konva indisponible");

  const width = window.innerWidth;
  const height = window.innerHeight;
  const stage = new Konva.Stage({ container: o.container, width, height });
  const backgroundLayer = new Konva.Layer();
  const annotationLayer = new Konva.Layer();
  const veilLayer = new Konva.Layer();
  const shapeGroup = new Konva.Group();
  const selectionHandleGroup = new Konva.Group({ name: "selection-handles" });
  const transformer = new Konva.Transformer({ rotateEnabled: false, flipEnabled: false, boundBoxFunc: boundResizeBox });
  const history = new History();

  let annotations = [];
  let selection = null;
  let tool = "select";
  let color = o.color || "#ff0000";
  let strokeWidth = positiveNumber(o.strokeWidth, 3);
  let fontSize = positiveNumber(o.fontSize, 24);
  let selectionDraft = null;
  let selectionResizeSide = null;
  let annotationDraft = null;
  let activeText = null;
  let start = null;
  let nextId = 1;
  let hoverAutoSelection = null;
  let pendingAutoSelection = null;

  // Rectangle d'affichage du fond (défaut : remplit le stage — comportement moniteur).
  const backgroundRect = o.backgroundRect || { x: 0, y: 0, width, height };
  // Échelle physique/CSS unique routée partout (fond, veil, mosaïque, export). En mode
  // letterbox (backgroundRect fourni), on la dérive du bitmap source / largeur d'affichage
  // pour exporter à la résolution native ; sinon on garde o.scale (chemin moniteur).
  const scale = o.backgroundRect && o.image && o.image.naturalWidth
    ? o.image.naturalWidth / backgroundRect.width
    : positiveNumber(o.scale, 1);

  stage.add(backgroundLayer);
  stage.add(annotationLayer);
  stage.add(veilLayer);
  annotationLayer.add(shapeGroup);
  annotationLayer.add(selectionHandleGroup);
  annotationLayer.add(transformer);

  if (o.image) backgroundLayer.add(new Konva.Image({ image: o.image, x: backgroundRect.x, y: backgroundRect.y, width: backgroundRect.width, height: backgroundRect.height }));
  backgroundLayer.draw();
  if (o.initialSelection) {
    lockSelection(o.initialSelection);
  }
  notifyHistory();

  stage.on("pointerdown", (event) => {
    if (event.evt.button != null && event.evt.button !== 0) return;
    const point = stage.getPointerPosition();
    if (!point) return;

    if (selectionResizeSide) return;

    if (!selection) {
      const autoSelection = autoSelectionAt(point);
      start = clampToStage(point);
      if (autoSelection) {
        // On diffère la décision : un clic sans glisser verrouillera la fenêtre
        // (au relâchement), mais un glisser depuis cette zone démarre une
        // sélection libre depuis le point d'appui.
        pendingAutoSelection = autoSelection;
        drawVeil(autoSelection.selection, true);
        o.onSelectMove?.({ point: { ...start }, rect: autoSelection.selection });
        return;
      }
      selectionDraft = normalizedRect({ x: start.x, y: start.y, width: 0, height: 0 });
      drawVeil(selectionDraft, true);
      o.onSelectMove?.({ point: { ...start }, rect: selectionDraft });
      return;
    }

    if (tool === "select") {
      if (isTransformerTarget(event.target)) return;
      selectNode(event.target);
      return;
    }
    if (tool === "text") {
      if (insideSelection(point)) openTextEditor(clampToSelection(point));
      return;
    }
    if (tool === "bubble") {
      if (insideSelection(point)) {
        annotations.push({ id: `annotation-${nextId++}`, type: "bubble", x: point.x, y: point.y, color, label: "", labelOffset: null });
        renderAnnotations();
        saveHistory();
      }
      return;
    }
    if (!insideSelection(point)) return;

    start = clampToSelection(point);
    const descriptor = makeDescriptor(tool, start);
    if (!descriptor) return;
    const node = makeNode(descriptor);
    annotationDraft = { descriptor, node };
    shapeGroup.add(node);
    node.moveToBottom();
    annotationLayer.draw();
  });

  stage.on("pointermove", () => {
    const rawPoint = stage.getPointerPosition();
    if (!rawPoint) return;

    // Phase de pré-sélection : la loupe suit le curseur (survol) et la sélection
    // se dessine pendant le glisser. onSelectMove pilote le HUD (loupe + x,y + taille).
    if (!selection) {
      if (start && pendingAutoSelection) {
        const point = clampToStage(rawPoint);
        if (Math.hypot(point.x - start.x, point.y - start.y) >= DRAG_THRESHOLD) {
          // Le geste est devenu un glisser → on bascule en sélection libre.
          pendingAutoSelection = null;
          selectionDraft = normalizedRect({ x: start.x, y: start.y, width: point.x - start.x, height: point.y - start.y });
          drawVeil(selectionDraft, true);
        } else {
          drawVeil(pendingAutoSelection.selection, true);
        }
        o.onSelectMove?.({ point, rect: selectionDraft || pendingAutoSelection?.selection || null });
        return;
      }
      if (start && selectionDraft) {
        const point = clampToStage(rawPoint);
        selectionDraft = normalizedRect({ x: start.x, y: start.y, width: point.x - start.x, height: point.y - start.y });
        drawVeil(selectionDraft, true);
        hoverAutoSelection = null;
      } else {
        hoverAutoSelection = autoSelectionAt(rawPoint);
        if (hoverAutoSelection) drawVeil(hoverAutoSelection.selection, true);
        else {
          veilLayer.destroyChildren();
          veilLayer.draw();
        }
      }
      o.onSelectMove?.({
        point: clampToStage(rawPoint),
        rect: selectionDraft || hoverAutoSelection?.selection || null,
      });
      return;
    }

    if (selectionResizeSide) {
      resizeSelection(selectionResizeSide, clampToStage(rawPoint));
      return;
    }

    if (start && annotationDraft) {
      const point = clampToSelection(rawPoint);
      if (annotationDraft.descriptor.type === "free") {
        annotationDraft.descriptor.points.push(point.x, point.y);
      } else {
        updateDraftDescriptor(annotationDraft.descriptor, start, point);
      }
      applyDescriptor(annotationDraft.node, annotationDraft.descriptor);
      annotationLayer.batchDraw();
    }
  });

  stage.on("pointerup", finishPointer);
  stage.on("pointercancel", cancelDraft);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointerup", finishPointer);
  window.addEventListener("pointercancel", cancelDraft);

  function finishPointer(event) {
    if (event?.evt?.type === "pointercancel" || event?.type === "pointercancel") {
      cancelDraft();
      return;
    }
    if (selectionResizeSide) {
      selectionResizeSide = null;
      o.onSelectionDone?.({ ...selection });
      return;
    }

    start = null;

    if (!selection && pendingAutoSelection) {
      // Relâchement sans glisser : c'était un clic → on verrouille la fenêtre.
      const candidate = pendingAutoSelection;
      pendingAutoSelection = null;
      lockSelection(candidate.selection);
      return;
    }

    if (!selection && selectionDraft) {
      const rect = selectionDraft;
      selectionDraft = null;
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
        veilLayer.destroyChildren();
        veilLayer.draw();
        return;
      }
      selection = rect;
      shapeGroup.clip(selection);
      drawVeil();
      o.onSelectionDone?.({ ...selection });
      return;
    }

    if (!annotationDraft) return;
    const { descriptor, node } = annotationDraft;
    annotationDraft = null;
    if (isDegenerate(descriptor)) {
      node.destroy();
      annotationLayer.draw();
      return;
    }
    if (descriptor.type === "mosaic") {
      descriptor.cropX = descriptor.x * scale;
      descriptor.cropY = descriptor.y * scale;
    }
    annotations.push(cloneDescriptor(descriptor));
    node.destroy();
    renderAnnotations();
    saveHistory();
  }

  function cancelDraft() {
    discardText();
    annotationDraft?.node.destroy();
    annotationDraft = null;
    selectionDraft = null;
    pendingAutoSelection = null;
    selectionResizeSide = null;
    start = null;
    if (selection) drawVeil();
    else {
      veilLayer.destroyChildren();
      veilLayer.draw();
    }
    annotationLayer.draw();
  }

  transformer.on("transformend", () => {
    if (tool !== "select") return;
    const node = transformer.nodes()[0];
    if (!node) return;
    normalizeTransformedNode(node);
    syncDescriptorFromNode(node);
    saveHistory();
  });

  function onKeyDown(event) {
    if (isEditableTarget(event.target)) return;
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const node = transformer.nodes()[0];
    if (!node) return;
    event.preventDefault();
    transformer.nodes([]);
    annotations = annotations.filter((descriptor) => descriptor.id !== node.id());
    node.destroy();
    annotationLayer.draw();
    saveHistory();
  }

  function makeDescriptor(kind, point) {
    const common = { id: `annotation-${nextId++}`, type: kind, stroke: color, strokeWidth };
    if (kind === "rect") return { ...common, x: point.x, y: point.y, width: 0, height: 0 };
    if (kind === "ellipse") return { ...common, x: point.x, y: point.y, radiusX: 0, radiusY: 0 };
    if (kind === "line" || kind === "arrow") return { ...common, x: 0, y: 0, points: [point.x, point.y, point.x, point.y] };
    if (kind === "free") return { ...common, x: 0, y: 0, points: [point.x, point.y] };
    if (kind === "mosaic") return { ...common, x: point.x, y: point.y, width: 0, height: 0, cropX: 0, cropY: 0 };
    return null;
  }

  function updateDraftDescriptor(descriptor, from, to) {
    if (descriptor.type === "rect" || descriptor.type === "mosaic") Object.assign(descriptor, normalizedRect({ x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y }));
    else if (descriptor.type === "ellipse") Object.assign(descriptor, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, radiusX: Math.abs(to.x - from.x) / 2, radiusY: Math.abs(to.y - from.y) / 2 });
    else descriptor.points = [from.x, from.y, to.x, to.y];
  }

  function makeNode(descriptor) {
    const common = { id: descriptor.id, stroke: descriptor.stroke, strokeWidth: descriptor.strokeWidth, draggable: tool === "select" };
    let node;
    if (descriptor.type === "rect") node = new Konva.Rect({ ...common, x: descriptor.x, y: descriptor.y, width: descriptor.width, height: descriptor.height });
    else if (descriptor.type === "ellipse") node = new Konva.Ellipse({ ...common, x: descriptor.x, y: descriptor.y, radiusX: descriptor.radiusX, radiusY: descriptor.radiusY });
    else if (descriptor.type === "line") node = new Konva.Line({ ...common, x: descriptor.x, y: descriptor.y, points: descriptor.points });
    else if (descriptor.type === "arrow") node = new Konva.Arrow({ ...common, x: descriptor.x, y: descriptor.y, points: descriptor.points });
    else if (descriptor.type === "free") node = new Konva.Line({ ...common, x: descriptor.x, y: descriptor.y, points: descriptor.points, tension: 0.4, lineCap: "round", lineJoin: "round" });
    else if (descriptor.type === "text") node = new Konva.Text({ id: descriptor.id, x: descriptor.x, y: descriptor.y, text: descriptor.text, fill: descriptor.fill, fontSize: descriptor.fontSize, fontFamily: FONT_FAMILY, draggable: tool === "select" });
    else if (descriptor.type === "mosaic") {
      if (descriptor.width <= 0 || descriptor.height <= 0) {
        node = new Konva.Rect({ id: descriptor.id, x: descriptor.x, y: descriptor.y, width: descriptor.width, height: descriptor.height, fill: "rgba(0,0,0,0.55)", draggable: tool === "select" });
      } else {
        node = new Konva.Image({
          id: descriptor.id, x: descriptor.x, y: descriptor.y,
          width: descriptor.width, height: descriptor.height,
          image: o.image, crop: mosaicCrop(descriptor, scale),
          draggable: tool === "select",
          filters: [Konva.Filters.Pixelate], pixelSize: MOSAIC_PIXEL,
        });
        node.cache();
      }
    }
    else throw new Error(`Type d'annotation inconnu: ${descriptor.type}`);
    node.dragBoundFunc((position) => boundDragPosition(node, position));
    return node;
  }

  function applyDescriptor(node, descriptor) {
    if (descriptor.type === "rect" || descriptor.type === "mosaic") node.setAttrs({ x: descriptor.x, y: descriptor.y, width: descriptor.width, height: descriptor.height });
    else if (descriptor.type === "ellipse") node.setAttrs({ x: descriptor.x, y: descriptor.y, radiusX: descriptor.radiusX, radiusY: descriptor.radiusY });
    else node.setAttrs({ x: descriptor.x, y: descriptor.y, points: descriptor.points });
  }

  function bindShape(node) {
    node.on("click tap", (event) => {
      if (tool !== "select") return;
      event.cancelBubble = true;
      selectNode(node);
    });
    node.on("dragend", () => {
      syncDescriptorFromNode(node);
      saveHistory();
    });
  }

  function selectNode(node) {
    if (tool !== "select" || !node || node === stage || node.getParent() !== shapeGroup || node === transformer) {
      transformer.nodes([]);
    } else if (node.getClassName() === "Rect" || node.getClassName() === "Ellipse") {
      transformer.nodes([node]);
      transformer.enabledAnchors(RESIZE_ANCHORS);
    } else {
      transformer.nodes([node]);
      transformer.enabledAnchors([]);
    }
    annotationLayer.draw();
  }

  function isTransformerTarget(node) {
    while (node && node !== annotationLayer) {
      if (node === transformer) return true;
      node = node.getParent?.();
    }
    return false;
  }

  function normalizeTransformedNode(node) {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scale({ x: 1, y: 1 });
    if (node.getClassName() === "Rect") node.setAttrs({ width: Math.max(1, node.width() * scaleX), height: Math.max(1, node.height() * scaleY) });
    else if (node.getClassName() === "Ellipse") node.setAttrs({ radiusX: Math.max(1, node.radiusX() * scaleX), radiusY: Math.max(1, node.radiusY() * scaleY) });
  }

  function boundResizeBox(oldBox, newBox) {
    return boxInsideSelection(newBox) ? newBox : oldBox;
  }

  function boundDragPosition(node, position) {
    if (!selection) return position;
    const current = node.absolutePosition();
    const box = node.getClientRect();
    if (box.width > selection.width || box.height > selection.height) return current;
    return {
      x: clamp(position.x, current.x + selection.x - box.x, current.x + selection.x + selection.width - box.x - box.width),
      y: clamp(position.y, current.y + selection.y - box.y, current.y + selection.y + selection.height - box.y - box.height),
    };
  }

  function boxInsideSelection(box) {
    if (!selection) return true;
    return box.x >= selection.x
      && box.y >= selection.y
      && box.x + box.width <= selection.x + selection.width
      && box.y + box.height <= selection.y + selection.height;
  }

  function syncDescriptorFromNode(node) {
    const descriptor = annotations.find((item) => item.id === node.id());
    if (!descriptor) throw new Error(`Descripteur absent pour le node ${node.id()}`);
    descriptor.x = node.x();
    descriptor.y = node.y();
    if (descriptor.type === "rect") {
      descriptor.width = node.width();
      descriptor.height = node.height();
    } else if (descriptor.type === "ellipse") {
      descriptor.radiusX = node.radiusX();
      descriptor.radiusY = node.radiusY();
    } else if (descriptor.type === "text" || descriptor.type === "mosaic") {
      // x/y déjà synchronisés ; contenu (texte/recadrage) inchangé
    } else {
      descriptor.points = [...node.points()];
    }
  }

  function isDegenerate(descriptor) {
    if (descriptor.type === "rect") return descriptor.width < MIN_SIZE || descriptor.height < MIN_SIZE;
    if (descriptor.type === "ellipse") return descriptor.radiusX * 2 < MIN_SIZE || descriptor.radiusY * 2 < MIN_SIZE;
    if (descriptor.type === "text") return !descriptor.text || descriptor.text.trim() === "";
    if (descriptor.type === "mosaic") return descriptor.width < MIN_SIZE || descriptor.height < MIN_SIZE;
    if (descriptor.type === "free") {
      let length = 0;
      const p = descriptor.points;
      for (let i = 2; i < p.length; i += 2) length += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      return length < MIN_SIZE;
    }
    return Math.hypot(descriptor.points[2] - descriptor.points[0], descriptor.points[3] - descriptor.points[1]) < MIN_SIZE;
  }

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
      const connector = new Konva.Line({ points: [off.dx, off.dy, ...bubbleConnectorEnd(off.dx, off.dy, BUBBLE_RADIUS)], stroke: descriptor.color, strokeWidth: 2 });
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
      labelGroup.on("dragmove", () => connector.points([labelGroup.x(), labelGroup.y(), ...bubbleConnectorEnd(labelGroup.x(), labelGroup.y(), BUBBLE_RADIUS)]));
      labelGroup.on("dragend", (event) => {
        if (event.target !== labelGroup) return;
        descriptor.labelOffset = { dx: labelGroup.x(), dy: labelGroup.y() };
        saveHistory();
      });
    }

    group.on("click tap", (event) => {
      if (tool !== "select") return;
      event.cancelBubble = true;
      selectNode(group);
    });
    group.on("dragend", (event) => {
      if (event.target !== group) return;
      descriptor.x = group.x();
      descriptor.y = group.y();
      saveHistory();
    });
    group.on("dblclick dbltap", (event) => {
      event.cancelBubble = true;
      openLabelEditor(descriptor, group);
    });
    return group;
  }

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

  function renderAnnotations() {
    transformer.nodes([]);
    shapeGroup.destroyChildren();
    annotations.forEach((descriptor, index) => {
      if (descriptor.type === "bubble") {
        shapeGroup.add(makeBubbleNode(descriptor, bubbleNumberAt(annotations, index)));
      } else {
        const node = makeNode(descriptor);
        bindShape(node);
        shapeGroup.add(node);
      }
      const number = Number(String(descriptor.id).replace("annotation-", ""));
      if (Number.isFinite(number)) nextId = Math.max(nextId, number + 1);
    });
    transformer.moveToTop();
    annotationLayer.draw();
  }

  function saveHistory() {
    transformer.moveToTop();
    history.push(annotations);
    notifyHistory();
  }

  function restore(snapshot) {
    annotations = snapshot;
    renderAnnotations();
  }

  function notifyHistory() {
    o.onHistoryChange?.({ canUndo: history.canUndo(), canRedo: history.canRedo() });
  }

  function lockSelection(rect) {
    selection = clampRectToStage(rect);
    if (selection.width < MIN_SIZE || selection.height < MIN_SIZE) {
      selection = null;
      return false;
    }
    hoverAutoSelection = null;
    shapeGroup.clip(selection);
    drawVeil();
    o.onSelectionDone?.({ ...selection });
    return true;
  }

  function autoSelectionAt(point) {
    if (start || selectionDraft) return null;
    const p = clampToStage(point);
    const candidates = Array.isArray(o.autoSelections) ? o.autoSelections : [];
    for (const candidate of candidates) {
      const activation = candidate?.activation;
      const selectionRect = candidate?.selection;
      if (!activation || !selectionRect) continue;
      if (pointInRect(p, activation)) {
        const normalized = clampRectToStage(selectionRect);
        if (normalized.width >= MIN_SIZE && normalized.height >= MIN_SIZE) {
          return { selection: normalized };
        }
      }
    }
    return null;
  }

  function drawVeil(rect = selection, isDraft = false) {
    veilLayer.destroyChildren();
    selectionHandleGroup.destroyChildren();
    const shade = { fill: o.veilColor || "rgba(0, 0, 0, 0.45)", listening: false };
    const { x, y, width: w, height: h } = rect;
    veilLayer.add(
      new Konva.Rect({ ...shade, x: 0, y: 0, width, height: y }),
      new Konva.Rect({ ...shade, x: 0, y, width: x, height: h }),
      new Konva.Rect({ ...shade, x: x + w, y, width: width - x - w, height: h }),
      new Konva.Rect({ ...shade, x: 0, y: y + h, width, height: height - y - h }),
      new Konva.Rect({ x, y, width: w, height: h, stroke: o.selectionColor || "#168cff", strokeWidth: 2, dash: isDraft ? [6, 4] : undefined, listening: false }),
    );
    if (!isDraft) {
      const handles = [
        ["top", x + w / 2, y],
        ["right", x + w, y + h / 2],
        ["bottom", x + w / 2, y + h],
        ["left", x, y + h / 2],
      ];
      for (const [side, handleX, handleY] of handles) {
        const handle = new Konva.Circle({
          name: "selection-handle",
          side,
          x: handleX,
          y: handleY,
          radius: HANDLE_RADIUS,
          fill: "#ffffff",
          stroke: "rgba(0, 0, 0, 0.45)",
          strokeWidth: 1,
          hitStrokeWidth: HANDLE_HIT_STROKE,
        });
        handle.on("pointerdown", (event) => {
          event.cancelBubble = true;
          selectionResizeSide = side;
        });
        selectionHandleGroup.add(handle);
      }
    }
    annotationLayer.draw();
    veilLayer.draw();
  }

  function resizeSelection(side, point) {
    const next = { ...selection };
    if (side === "left") {
      const right = selection.x + selection.width;
      next.x = clamp(point.x, 0, right - MIN_SIZE);
      next.width = right - next.x;
    } else if (side === "right") {
      const right = clamp(point.x, selection.x + MIN_SIZE, width);
      next.width = right - selection.x;
    } else if (side === "top") {
      const bottom = selection.y + selection.height;
      next.y = clamp(point.y, 0, bottom - MIN_SIZE);
      next.height = bottom - next.y;
    } else if (side === "bottom") {
      const bottom = clamp(point.y, selection.y + MIN_SIZE, height);
      next.height = bottom - selection.y;
    }
    selection = next;
    shapeGroup.clip(selection);
    drawVeil();
  }

  function clampToStage(point) {
    return { x: clamp(point.x, 0, width), y: clamp(point.y, 0, height) };
  }

  function clampToSelection(point) {
    return { x: clamp(point.x, selection.x, selection.x + selection.width), y: clamp(point.y, selection.y, selection.y + selection.height) };
  }

  function insideSelection(point) {
    return point.x >= selection.x && point.x <= selection.x + selection.width && point.y >= selection.y && point.y <= selection.y + selection.height;
  }

  function clampRectToStage(rect) {
    const initial = normalizedRect(rect);
    const x = clamp(initial.x, 0, width);
    const y = clamp(initial.y, 0, height);
    return {
      x,
      y,
      width: clamp(initial.width, 0, width - x),
      height: clamp(initial.height, 0, height - y),
    };
  }

  // Ouvre un <textarea> HTML temporaire au point cliqué pour la saisie sur place.
  function openTextEditor(point, options = {}) {
    commitText();
    const textarea = document.createElement("textarea");
    textarea.value = options.initial || "";
    Object.assign(textarea.style, {
      position: "fixed",
      left: `${point.x}px`,
      top: `${point.y}px`,
      margin: "0",
      padding: "0",
      border: "none",
      outline: "none",
      background: "transparent",
      color,
      font: `${fontSize}px ${FONT_FAMILY}`,
      lineHeight: "1",
      whiteSpace: "pre",
      overflow: "hidden",
      resize: "none",
      zIndex: "20",
    });
    document.body.appendChild(textarea);
    activeText = { textarea, point, onCommit: options.onCommit };
    const autoSize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.style.width = "auto";
      textarea.style.width = `${textarea.scrollWidth + 4}px`;
    };
    textarea.addEventListener("input", autoSize);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        commitText();
      }
    });
    textarea.addEventListener("blur", commitText);
    setTimeout(() => {
      textarea.focus();
      autoSize();
    }, 0);
  }

  // Valide la saisie en cours : retire le textarea et pose un Konva.Text si non vide.
  function commitText() {
    if (!activeText) return;
    const { textarea, point, onCommit } = activeText;
    const value = textarea.value;
    activeText = null;
    textarea.remove();
    const text = value.replace(/\s+$/u, "");
    if (onCommit) {
      onCommit(text);
      return;
    }
    if (!text.trim()) return;
    annotations.push({ id: `annotation-${nextId++}`, type: "text", x: point.x, y: point.y, text, fill: color, fontSize });
    renderAnnotations();
    saveHistory();
  }

  // Abandonne la saisie en cours sans rien poser.
  function discardText() {
    if (!activeText) return;
    activeText.textarea.remove();
    activeText = null;
  }

  return {
    setTool(value) {
      if (!["select", "rect", "ellipse", "line", "arrow", "free", "text", "bubble", "mosaic"].includes(value)) throw new Error(`Outil inconnu: ${value}`);
      tool = value;
      if (tool !== "select") transformer.nodes([]);
      shapeGroup.getChildren().forEach((node) => node.draggable(tool === "select"));
      shapeGroup.find(".label").forEach((node) => node.draggable(tool === "select"));
      annotationLayer.draw();
    },
    setColor(value) { color = value; },
    setStrokeWidth(value) { strokeWidth = positiveNumber(value, strokeWidth); },
    setFontSize(value) { fontSize = positiveNumber(value, fontSize); },
    undo() { cancelDraft(); restore(history.undo()); notifyHistory(); },
    redo() { cancelDraft(); restore(history.redo()); notifyHistory(); },
    exportPngBase64() {
      commitText();
      cancelDraft();
      if (!selection) return null;
      const transformerVisible = transformer.visible();
      const veilVisible = veilLayer.visible();
      transformer.visible(false);
      veilLayer.visible(false);
      try {
        return stage.toCanvas({ ...selection, pixelRatio: scale }).toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
      } finally {
        transformer.visible(transformerVisible);
        veilLayer.visible(veilVisible);
        annotationLayer.draw();
        veilLayer.draw();
      }
    },
    selectionPhysicalRect() {
      if (!selection) return null;
      return {
        x: Math.round(selection.x * scale),
        y: Math.round(selection.y * scale),
        width: Math.round(selection.width * scale),
        height: Math.round(selection.height * scale),
      };
    },
    hasSelection() { return selection !== null; },
    destroy() {
      discardText();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerup", finishPointer);
      window.removeEventListener("pointercancel", cancelDraft);
      stage.destroy();
    },
  };
}

function normalizedRect({ x, y, width, height }) {
  return { x: width < 0 ? x + width : x, y: height < 0 ? y + height : y, width: Math.abs(width), height: Math.abs(height) };
}

function cloneDescriptor(descriptor) {
  return structuredClone(descriptor);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pointInRect(point, rect) {
  return point.x >= rect.x
    && point.x < rect.x + rect.width
    && point.y >= rect.y
    && point.y < rect.y + rect.height;
}
