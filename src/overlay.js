import { createEditor } from "./editor/editor.js";

const { invoke } = window.__TAURI__.core;
const dialog = window.__TAURI__.dialog;

const toolbar = document.getElementById("toolbar");
const thickness = document.getElementById("thickness");
const fontsize = document.getElementById("fontsize");
const undoButton = document.getElementById("undo");
const redoButton = document.getElementById("redo");
const copyButton = document.getElementById("copy-btn");
const saveButton = document.getElementById("save-btn");
let editor = null;
let busy = false;

undoButton.disabled = true;
redoButton.disabled = true;

(async function init() {
  try {
    const dataUrl = await invoke("get_capture_data_url");
    const image = await loadImage(dataUrl);
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
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Capture image failed to load"));
    image.src = src;
  });
}

function setBusy(value) {
  busy = value;
  copyButton.disabled = value;
  saveButton.disabled = value;
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
  });
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

async function doCopy() {
  if (busy || !editor?.hasSelection()) return;
  setBusy(true);
  try {
    await invoke("copy_composited", { pngBase64: editor.exportPngBase64() });
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
  } catch (error) {
    console.error("Save failed:", error);
    window.alert("Save failed: " + error);
    await invoke("cancel_capture");
  } finally {
    setBusy(false);
  }
}

window.addEventListener("keydown", async (event) => {
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
