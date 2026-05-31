import { createEditor } from "./editor/editor.js";
import { createColorPicker } from "./color-picker.js";
import { isEditableTarget, shouldCloseOcrPanel } from "./editable-target.js";

const { invoke } = window.__TAURI__.core;
const dialog = window.__TAURI__.dialog;

const toolbar = document.getElementById("toolbar");
const thickness = document.getElementById("thickness");
const fontsize = document.getElementById("fontsize");
const customColor = document.getElementById("custom-color");
const outputSize = document.getElementById("output-size");
const savedSize = localStorage.getItem("outputSize");
if (savedSize) outputSize.value = savedSize;
outputSize.addEventListener("change", () => localStorage.setItem("outputSize", outputSize.value));
const undoButton = document.getElementById("undo");
const redoButton = document.getElementById("redo");
const ocrBtn = document.getElementById("ocr-btn");
const ocrPanel = document.getElementById("ocr-panel");
const ocrText = document.getElementById("ocr-text");
const ocrCopy = document.getElementById("ocr-copy");
const copyButton = document.getElementById("copy-btn");
const saveButton = document.getElementById("save-btn");
let editor = null;
let busy = false;

undoButton.disabled = true;
redoButton.disabled = true;

(async function init() {
  try {
    const base = navigator.userAgent.includes("Windows") ? "http://capture.localhost" : "capture://localhost";
    const image = await loadImage(base + "/current?t=" + Date.now());
    const scale = image.naturalWidth / window.innerWidth;
    editor = createEditor({
      container: "stage",
      image,
      scale,
      color: document.querySelector(".swatch.active").dataset.color,
      strokeWidth: parseInt(thickness.value, 10),
      fontSize: parseInt(fontsize.value, 10),
      onSelectionDone: (selection) => positionAndShowToolbar(selection),
      onHistoryChange: ({ canUndo, canRedo }) => {
        undoButton.disabled = !canUndo;
        redoButton.disabled = !canRedo;
      },
    });
    setActiveTool("select");
    // La capture est déjà dessinée sur le canvas (draw() Konva synchrone) ; on affiche
    // maintenant. Pas de requestAnimationFrame : il ne se déclenche pas dans une fenêtre
    // masquée, ce qui laisserait l'overlay caché à jamais.
    invoke("show_overlay").catch(() => {});
  } catch (error) {
    console.error("Initialization failed:", error);
    window.alert("Initialization failed: " + error);
    try {
      await invoke("cancel_capture");
    } catch (cancelError) {
      console.error("Cancel after initialization failure failed:", cancelError);
    }
  }
})();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Capture image failed to load"));
    image.src = src;
  });
}

function setBusy(value) {
  busy = value;
  copyButton.disabled = value;
  saveButton.disabled = value;
  ocrBtn.disabled = value;
  ocrCopy.disabled = value;
}

// Place la barre d'outils par défaut juste sous la sélection ; s'il n'y a pas
// la place en dessous (sélection collée au bas de l'écran), la met à l'intérieur
// de la zone, en bas. Position bornée au viewport. Non persistée d'une capture
// à l'autre (chaque capture recrée l'overlay).
function positionAndShowToolbar(selection) {
  toolbar.classList.remove("hidden");
  const gap = 8;
  const tw = toolbar.offsetWidth;
  const th = toolbar.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = selection.y + selection.height + gap;
  if (top + th + gap > vh) {
    // pas de place dessous → à l'intérieur de la zone, en bas
    top = selection.y + selection.height - th - gap;
  }
  top = Math.max(gap, Math.min(top, vh - th - gap));

  let left = Math.max(gap, Math.min(selection.x, vw - tw - gap));
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

// Déplacement de la barre via la poignée (la position n'est pas mémorisée).
const dragHandle = document.getElementById("drag-handle");
let dragOffset = null;
dragHandle.addEventListener("pointerdown", (event) => {
  dragOffset = { x: event.clientX - toolbar.offsetLeft, y: event.clientY - toolbar.offsetTop };
  dragHandle.setPointerCapture(event.pointerId);
  event.preventDefault();
});
dragHandle.addEventListener("pointermove", (event) => {
  if (!dragOffset) return;
  const tw = toolbar.offsetWidth;
  const th = toolbar.offsetHeight;
  const left = Math.max(0, Math.min(event.clientX - dragOffset.x, window.innerWidth - tw));
  const top = Math.max(0, Math.min(event.clientY - dragOffset.y, window.innerHeight - th));
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
});
dragHandle.addEventListener("pointerup", (event) => {
  dragOffset = null;
  try { dragHandle.releasePointerCapture(event.pointerId); } catch (_) {}
});

function setActiveTool(tool) {
  if (!editor) return;
  editor.setTool(tool);
  document.querySelectorAll(".tool").forEach((button) =>
    button.classList.toggle("active", button.dataset.tool === tool)
  );
}

document.querySelectorAll(".tool").forEach((button) =>
  button.addEventListener("click", () => setActiveTool(button.dataset.tool))
);
document.querySelectorAll(".swatch").forEach((button, index) => {
  button.classList.toggle("active", index === 0);
  button.addEventListener("click", () => {
    if (!editor) return;
    editor.setColor(button.dataset.color);
    document.querySelectorAll(".swatch").forEach((swatch) =>
      swatch.classList.toggle("active", swatch === button)
    );
    customColor.classList.remove("active");
  });
});
const colorPicker = createColorPicker({
  button: customColor,
  initialHex: localStorage.getItem("customColor") || "#ff8800",
  onChange: (hex) => {
    if (editor) editor.setColor(hex);
    localStorage.setItem("customColor", hex);
    document.querySelectorAll(".swatch").forEach((swatch) => swatch.classList.remove("active"));
    customColor.classList.add("active");
  },
});
thickness.addEventListener("change", (event) => {
  if (!editor) return;
  editor.setStrokeWidth(parseInt(event.target.value, 10));
});
fontsize.addEventListener("change", (event) => {
  if (!editor) return;
  editor.setFontSize(parseInt(event.target.value, 10));
});
undoButton.addEventListener("click", () => editor?.undo());
redoButton.addEventListener("click", () => editor?.redo());

ocrBtn.addEventListener("click", async () => {
  if (busy || !editor?.hasSelection()) return;
  const rect = editor.selectionPhysicalRect();
  if (!rect) return;
  setBusy(true);
  ocrBtn.textContent = "OCR…";
  try {
    const text = await invoke("ocr_region", { rect });
    ocrText.value = text || "";
    ocrPanel.hidden = false;
    ocrText.focus();
  } catch (error) {
    console.error("OCR failed:", error);
    window.alert("OCR failed: " + error);
  } finally {
    setBusy(false);
    ocrBtn.textContent = "OCR";
  }
});
document.getElementById("ocr-close").addEventListener("click", () => { ocrPanel.hidden = true; });
ocrCopy.addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    await invoke("copy_text", { text: ocrText.value });
    ocrPanel.hidden = true;
    await invoke("cancel_capture");
  } catch (error) {
    console.error("Copy text failed:", error);
    window.alert("Copy text failed: " + error);
  } finally {
    setBusy(false);
  }
});

async function doCopy() {
  if (busy || !editor?.hasSelection()) return;
  setBusy(true);
  try {
    await invoke("copy_composited", { pngBase64: editor.exportPngBase64(), target: outputSize.value });
  } catch (error) {
    console.error("Copy failed:", error);
    window.alert("Copy failed: " + error);
    await invoke("cancel_capture");
  } finally {
    setBusy(false);
  }
}

copyButton.addEventListener("click", doCopy);
document.getElementById("cancel-btn").addEventListener("click", () => invoke("cancel_capture"));
saveButton.addEventListener("click", doSave);

async function doSave() {
  if (busy || !editor?.hasSelection()) return;
  setBusy(true);
  try {
    const target = outputSize.value;
    const suggested = await invoke("default_save_path", { format: target === "full" ? "png" : "jpeg" });
    const path = await dialog.save({
      defaultPath: suggested,
      filters: [
        { name: "PNG", extensions: ["png"] },
        { name: "JPEG", extensions: ["jpg", "jpeg"] },
      ],
    });
    if (!path) return;
    const lower = path.toLowerCase();
    let finalPath = path;
    let format;
    if (target === "full") {
      format = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg" : "png";
    } else {
      format = "jpeg";
      if (!(lower.endsWith(".jpg") || lower.endsWith(".jpeg"))) finalPath = path + ".jpg";
    }
    await invoke("save_composited", { pngBase64: editor.exportPngBase64(), path: finalPath, format, target });
  } catch (error) {
    console.error("Save failed:", error);
    window.alert("Save failed: " + error);
    await invoke("cancel_capture");
  } finally {
    setBusy(false);
  }
}

window.addEventListener("keydown", async (event) => {
  if (shouldCloseOcrPanel(event, ocrPanel.hidden)) {
    event.preventDefault();
    ocrPanel.hidden = true;
    return;
  }
  if (isEditableTarget(event.target)) {
    return;
  }
  const key = event.key.toLowerCase();
  const commandKey = event.metaKey || event.ctrlKey;

  if (event.key === "Escape") await invoke("cancel_capture");
  if (commandKey && key === "c") await doCopy();
  if (commandKey && key === "z" && !event.shiftKey) {
    event.preventDefault();
    editor?.undo();
  }
  if (commandKey && (key === "y" || (key === "z" && event.shiftKey))) {
    event.preventDefault();
    editor?.redo();
  }
});
