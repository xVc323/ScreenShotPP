import { createEditor } from "./editor/editor.js";

const { invoke } = window.__TAURI__.core;
const dialog = window.__TAURI__.dialog;

const toolbar = document.getElementById("toolbar");
const thickness = document.getElementById("thickness");
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
      onSelectionDone: () => toolbar.classList.remove("hidden"),
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
