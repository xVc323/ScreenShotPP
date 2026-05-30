const { invoke } = window.__TAURI__.core;
const dialog = window.__TAURI__.dialog;

const img = document.getElementById("shot");
const canvas = document.getElementById("dim");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("toolbar");

let start = null;     // point de départ en pixels CSS
let selection = null; // { x, y, w, h } en pixels CSS
let scale = 1;        // pixels physiques par pixel CSS

const dataUrl = await invoke("get_capture_data_url");
img.src = dataUrl;
img.onload = () => {
  resizeCanvas();
  scale = img.naturalWidth / img.clientWidth;
  drawDim();
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function drawDim() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (selection) {
    ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
    ctx.strokeStyle = "#4da3ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
  }
}

window.addEventListener("mousedown", (e) => {
  if (e.target.closest("#toolbar")) return;
  toolbar.classList.add("hidden");
  start = { x: e.clientX, y: e.clientY };
  selection = null;
});

window.addEventListener("mousemove", (e) => {
  if (!start) return;
  const x = Math.min(start.x, e.clientX);
  const y = Math.min(start.y, e.clientY);
  const w = Math.abs(e.clientX - start.x);
  const h = Math.abs(e.clientY - start.y);
  selection = { x, y, w, h };
  drawDim();
});

window.addEventListener("mouseup", () => {
  if (!start || !selection || selection.w < 3 || selection.h < 3) {
    start = null;
    return;
  }
  start = null;
  positionToolbar();
  toolbar.classList.remove("hidden");
});

window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") await invoke("cancel_capture");
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && selection) {
    await doCopy();
  }
});

function positionToolbar() {
  toolbar.style.left = `${selection.x}px`;
  toolbar.style.top = `${selection.y + selection.h + 8}px`;
}

function physicalRect() {
  return {
    x: Math.round(selection.x * scale),
    y: Math.round(selection.y * scale),
    width: Math.round(selection.w * scale),
    height: Math.round(selection.h * scale),
  };
}

async function doCopy() {
  await invoke("copy_selection", { rect: physicalRect() });
}

document.getElementById("copy-btn").addEventListener("click", doCopy);
document.getElementById("cancel-btn").addEventListener("click", () =>
  invoke("cancel_capture")
);
document.getElementById("save-btn").addEventListener("click", async () => {
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
  await invoke("save_selection", { rect: physicalRect(), path, format });
});

window.addEventListener("resize", () => {
  resizeCanvas();
  scale = img.naturalWidth / img.clientWidth;
  drawDim();
});
