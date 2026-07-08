// Mini-éditeur d'enregistrement (côté webview) : lecture du fichier temporaire,
// timeline avec crochets de trim draggables, boîte de crop redimensionnable,
// export MP4/GIF. La logique pure (trim/crop) vit dans trim.js / crop.js.
import { clampTrim, effectiveDuration } from "./trim.js";
import { clampCrop, displayToVideo } from "./crop.js";

const { invoke, convertFileSrc } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { save, confirm } = window.__TAURI__.dialog;
const { openPath, revealItemInDir } = window.__TAURI__.opener;

const player = document.getElementById("player");
const track = document.getElementById("track");
const rangeEl = document.getElementById("range");
const playhead = document.getElementById("playhead");
const hStart = document.getElementById("h-start");
const hEnd = document.getElementById("h-end");
const tStartEl = document.getElementById("t-start");
const tEndEl = document.getElementById("t-end");
const tDurEl = document.getElementById("t-dur");
const trimStartInput = document.getElementById("trim-start");
const trimEndInput = document.getElementById("trim-end");
const cropMeta = document.getElementById("crop-meta");
const speedSel = document.getElementById("speed");
const exportPresetSel = document.getElementById("export-preset");
const progressRow = document.getElementById("progress-row");
const progress = document.getElementById("export-progress");
const progressLabel = document.getElementById("export-progress-label");
const cropBox = document.getElementById("crop-box");
const cropToggle = document.getElementById("crop-toggle");
const resetCropBtn = document.getElementById("reset-crop");
const markStartBtn = document.getElementById("mark-start");
const markEndBtn = document.getElementById("mark-end");
const resetTrimBtn = document.getElementById("reset-trim");
const statusEl = document.getElementById("status");
const exportMp4Btn = document.getElementById("export-mp4");
const exportGifBtn = document.getElementById("export-gif");
const cancelExportBtn = document.getElementById("cancel-export");
const discardBtn = document.getElementById("discard");
const exportsPanel = document.getElementById("exports");
const exportsList = document.getElementById("exports-list");
const exportsCount = document.getElementById("exports-count");
const toasts = document.getElementById("toasts");

let sourcePath = null;
let crop = null; // rect en espace d'affichage du <video>, null = pas de crop
let duration = 0;
let startT = 0;
let endT = 0;
let exporting = false;
let cancelRequested = false;
let exports = [];

function fmt(t) {
  const s = Math.max(0, Math.floor(t));
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

(async function init() {
  try {
    sourcePath = await invoke("get_recording_info");
    player.src = convertFileSrc(sourcePath);
  } catch (e) {
    toast(`Could not load recording: ${e}`, "error");
    return;
  }
  player.addEventListener("loadedmetadata", () => {
    duration = player.duration || 0;
    startT = 0;
    endT = duration;
    renderTimeline();
    renderCrop();
    updateSummary();
  });
  await listen("export-progress", (e) => {
    // Le backend émet le timestamp de SORTIE ffmpeg, comprimé par setpts=PTS/speed.
    // On borne donc sur la durée effective (durée source / vitesse), pas la source.
    const total = effectiveDuration(startT, endT, Number(speedSel.value));
    setProgress(total > 0 ? Math.min(1, e.payload / total) : 0);
  });
})();

// ---- Timeline / trim ------------------------------------------------------

function pct(t) {
  return duration > 0 ? (t / duration) * 100 : 0;
}

function renderTrimInputs({ force = false } = {}) {
  trimStartInput.max = duration.toFixed(1);
  trimEndInput.max = duration.toFixed(1);
  if (force || document.activeElement !== trimStartInput) trimStartInput.value = startT.toFixed(1);
  if (force || document.activeElement !== trimEndInput) trimEndInput.value = endT.toFixed(1);
}

function renderTimeline() {
  hStart.style.left = `${pct(startT)}%`;
  hEnd.style.left = `${pct(endT)}%`;
  rangeEl.style.left = `${pct(startT)}%`;
  rangeEl.style.width = `${pct(endT - startT)}%`;
  const cur = Math.min(Math.max(player.currentTime || 0, startT), endT);
  playhead.style.left = `${pct(cur)}%`;
  tStartEl.textContent = fmt(startT);
  tEndEl.textContent = fmt(endT);
  tDurEl.textContent = `${effectiveDuration(startT, endT, Number(speedSel.value)).toFixed(1)}s`;
  renderTrimInputs();
  resetTrimBtn.disabled = exporting || (startT === 0 && Math.abs(endT - duration) < 0.01);
  updateSummary();
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setProgress(value) {
  progress.value = value;
  progressLabel.textContent = `${Math.round(value * 100)}%`;
}

function toast(message, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  toasts.append(el);
  window.setTimeout(() => el.classList.add("visible"), 20);
  window.setTimeout(() => {
    el.classList.remove("visible");
    window.setTimeout(() => el.remove(), 180);
  }, kind === "error" ? 5200 : 3200);
}

function updateSummary(message = null) {
  if (message) {
    setStatus(message);
    return;
  }
  const selected = effectiveDuration(startT, endT, Number(speedSel.value)).toFixed(1);
  const cropLabel = crop ? "crop on" : "no crop";
  setStatus(`${selected}s selected · ${speedSel.value}x · ${cropLabel}`);
}

function setExporting(value) {
  exporting = value;
  exportMp4Btn.disabled = value;
  exportGifBtn.disabled = value;
  cancelExportBtn.hidden = !value;
  cropToggle.disabled = value;
  resetCropBtn.disabled = value || !crop;
  markStartBtn.disabled = value;
  markEndBtn.disabled = value;
  resetTrimBtn.disabled = value || (startT === 0 && Math.abs(endT - duration) < 0.01);
  trimStartInput.disabled = value;
  trimEndInput.disabled = value;
  speedSel.disabled = value;
  exportPresetSel.disabled = value;
  discardBtn.disabled = value;
  progressRow.hidden = !value;
  if (!value) setProgress(0);
  document.body.classList.toggle("exporting", value);
}

function renderExports() {
  exportsPanel.hidden = exports.length === 0;
  exportsCount.textContent = String(exports.length);
  exportsList.innerHTML = "";
  for (const item of exports) {
    const row = document.createElement("div");
    row.className = "export-row";
    const label = document.createElement("div");
    label.className = "export-label";
    label.textContent = `${item.kind} · ${item.name}`;
    const actions = document.createElement("div");
    actions.className = "export-actions";
    const open = exportAction("Open", async () => {
      try {
        await openPath(item.path);
      } catch (e) {
        toast(`Could not open file: ${e}`, "error");
      }
    });
    const reveal = exportAction("Show", async () => {
      try {
        await revealItemInDir(item.path);
      } catch (e) {
        toast(`Could not show file: ${e}`, "error");
      }
    });
    const copy = exportAction("Copy", async () => {
      try {
        await invoke("copy_text", { text: item.path });
        toast("Path copied");
      } catch (e) {
        toast(`Could not copy path: ${e}`, "error");
      }
    });
    const remove = exportAction("Delete", async () => {
      const ok = typeof confirm === "function"
        ? await confirm(`Delete ${item.name}?`, { title: "Delete export", kind: "warning" })
        : window.confirm(`Delete ${item.name}?`);
      if (!ok) return;
      try {
        await invoke("delete_recording_export", { path: item.path });
        exports = exports.filter((candidate) => candidate.path !== item.path);
        renderExports();
        toast("Export deleted");
      } catch (e) {
        toast(`Could not delete export: ${e}`, "error");
      }
    });
    remove.classList.add("danger-link");
    actions.append(open, reveal, copy, remove);
    row.append(label, actions);
    exportsList.append(row);
  }
}

function exportAction(label, onClick) {
  const button = document.createElement("button");
  button.className = "btn subtle";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function fileName(path) {
  return path.split(/[\\/]/).pop() || path;
}

function parentDir(path) {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return idx >= 0 ? path.slice(0, idx) : "";
}

function joinPath(dir, name) {
  if (!dir) return name;
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir}${sep}${name}`;
}

function stampName(gif) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `recording-${date}-${time}-edited.${gif ? "gif" : "mp4"}`;
}

function presetFor(gif) {
  const value = exportPresetSel.value;
  if (gif && !value.startsWith("gif-")) return "gif-smooth";
  if (!gif && !value.startsWith("mp4-")) return "mp4-high";
  return value;
}

function ensurePresetKind(gif) {
  const next = presetFor(gif);
  if (exportPresetSel.value !== next) exportPresetSel.value = next;
  return next;
}

function timeAtClientX(clientX) {
  const r = track.getBoundingClientRect();
  const ratio = r.width > 0 ? (clientX - r.left) / r.width : 0;
  return Math.min(Math.max(ratio, 0), 1) * duration;
}

function applyTrim(rawStart, rawEnd) {
  const t = clampTrim(rawStart, rawEnd, duration);
  startT = t.start;
  endT = t.end;
  renderTimeline();
}

function applyTrimInputs() {
  const nextStart = Number.parseFloat(trimStartInput.value);
  const nextEnd = Number.parseFloat(trimEndInput.value);
  applyTrim(Number.isFinite(nextStart) ? nextStart : startT, Number.isFinite(nextEnd) ? nextEnd : endT);
  renderTrimInputs({ force: true });
  player.currentTime = Math.min(Math.max(player.currentTime || 0, startT), endT);
}

function startBracketDrag(handle, isStart) {
  handle.addEventListener("pointerdown", (event) => {
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    const move = (e) => {
      const t = timeAtClientX(e.clientX);
      if (isStart) applyTrim(t, endT);
      else applyTrim(startT, t);
      player.currentTime = isStart ? startT : endT;
    };
    const up = (e) => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}
startBracketDrag(hStart, true);
startBracketDrag(hEnd, false);

// Clic sur la piste (hors crochets) : déplace la tête de lecture / preview.
track.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".bracket")) return;
  player.currentTime = Math.min(Math.max(timeAtClientX(event.clientX), startT), endT);
});

// La lecture reste bornée à la zone conservée [startT, endT].
player.addEventListener("timeupdate", () => {
  if (player.currentTime > endT) {
    player.pause();
    player.currentTime = endT;
  } else if (player.currentTime < startT) {
    player.currentTime = startT;
  }
  renderTimeline();
});

trimStartInput.addEventListener("change", applyTrimInputs);
trimEndInput.addEventListener("change", applyTrimInputs);
markStartBtn.addEventListener("click", () => {
  applyTrim(player.currentTime || 0, endT);
  player.currentTime = startT;
});
markEndBtn.addEventListener("click", () => {
  applyTrim(startT, player.currentTime || duration);
  player.currentTime = endT;
});
speedSel.addEventListener("change", renderTimeline);

// ---- Crop -----------------------------------------------------------------
// `crop` est en pixels d'affichage du <video> (0..clientWidth/Height). À
// l'export, displayToVideo() le convertit en pixels vidéo réels.

/** Positionne #crop-box par-dessus la vidéo (letterboxée dans #stage). */
function renderCrop() {
  if (!crop) {
    cropBox.hidden = true;
    cropMeta.textContent = "Crop off";
    return;
  }
  crop = clampCrop(crop, player.clientWidth, player.clientHeight);
  const videoCrop = player.videoWidth && player.videoHeight
    ? displayToVideo(crop, player.clientWidth, player.clientHeight, player.videoWidth, player.videoHeight)
    : null;
  cropMeta.textContent = videoCrop
    ? `Crop ${videoCrop.width}×${videoCrop.height}`
    : `Crop ${Math.round(crop.width)}×${Math.round(crop.height)}`;
  cropBox.hidden = false;
  cropBox.style.left = `${player.offsetLeft + crop.x}px`;
  cropBox.style.top = `${player.offsetTop + crop.y}px`;
  cropBox.style.width = `${crop.width}px`;
  cropBox.style.height = `${crop.height}px`;
}

cropToggle.addEventListener("click", () => {
  if (crop) {
    crop = null;
    cropToggle.classList.remove("active");
  } else {
    // Rect initial : centré, 60 % de la surface d'affichage de la vidéo.
    const w = player.clientWidth * 0.6;
    const h = player.clientHeight * 0.6;
    crop = { x: (player.clientWidth - w) / 2, y: (player.clientHeight - h) / 2, width: w, height: h };
    cropToggle.classList.add("active");
  }
  renderCrop();
  resetCropBtn.disabled = !crop;
  updateSummary();
});

resetCropBtn.addEventListener("click", () => {
  crop = null;
  cropToggle.classList.remove("active");
  renderCrop();
  resetCropBtn.disabled = true;
  updateSummary();
});

resetTrimBtn.addEventListener("click", () => {
  startT = 0;
  endT = duration;
  player.currentTime = 0;
  renderTimeline();
});

// Drag du corps (déplacement) et des poignées (redimensionnement). L'état de
// glissement retient le point de départ et le rect initial pour un delta stable.
let dragState = null;

function pointerToVideo(event) {
  const rect = player.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function startDrag(event, mode) {
  if (!crop) return;
  dragState = { mode, start: pointerToVideo(event), origin: { ...crop } };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function onDragMove(event) {
  if (!dragState) return;
  const p = pointerToVideo(event);
  const dx = p.x - dragState.start.x;
  const dy = p.y - dragState.start.y;
  const o = dragState.origin;
  let next;
  if (dragState.mode === "move") {
    const maxX = player.clientWidth - o.width;
    const maxY = player.clientHeight - o.height;
    next = {
      x: Math.max(0, Math.min(o.x + dx, maxX)),
      y: Math.max(0, Math.min(o.y + dy, maxY)),
      width: o.width,
      height: o.height,
    };
  } else {
    // Redimensionnement : le coin opposé reste fixe.
    let left = o.x;
    let top = o.y;
    let right = o.x + o.width;
    let bottom = o.y + o.height;
    if (dragState.mode.includes("w")) left = o.x + dx;
    if (dragState.mode.includes("e")) right = o.x + o.width + dx;
    if (dragState.mode.includes("n")) top = o.y + dy;
    if (dragState.mode.includes("s")) bottom = o.y + o.height + dy;
    const MIN = 20;
    if (right - left < MIN) {
      if (dragState.mode.includes("w")) left = right - MIN;
      else right = left + MIN;
    }
    if (bottom - top < MIN) {
      if (dragState.mode.includes("n")) top = bottom - MIN;
      else bottom = top + MIN;
    }
    next = { x: left, y: top, width: right - left, height: bottom - top };
  }
  crop = clampCrop(next, player.clientWidth, player.clientHeight);
  renderCrop();
  updateSummary();
}

function endDrag(event) {
  if (!dragState) return;
  dragState = null;
  try {
    event.currentTarget.releasePointerCapture(event.pointerId);
  } catch (_) {}
}

cropBox.addEventListener("pointerdown", (event) => {
  if (event.target.classList.contains("handle")) return; // géré par la poignée
  startDrag(event, "move");
});
cropBox.querySelectorAll(".handle").forEach((h) => {
  const mode = [...h.classList].find((c) => c !== "handle");
  h.addEventListener("pointerdown", (event) => startDrag(event, mode));
});
for (const el of [cropBox, ...cropBox.querySelectorAll(".handle")]) {
  el.addEventListener("pointermove", onDragMove);
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
}

window.addEventListener("resize", renderCrop);

// ---- Export ---------------------------------------------------------------

async function doExport(gif) {
  if (exporting) return;
  const preset = ensurePresetKind(gif);
  const suggested = joinPath(parentDir(sourcePath), stampName(gif));
  const outputPath = await save({ defaultPath: suggested });
  if (!outputPath) return;
  setProgress(0);
  cancelRequested = false;
  setExporting(true);
  updateSummary(`Exporting ${gif ? "GIF" : "MP4"}...`);
  const cropVideo = crop
    ? displayToVideo(crop, player.clientWidth, player.clientHeight, player.videoWidth, player.videoHeight)
    : null;
  try {
    await invoke("export_recording", {
      options: {
        trimStart: startT,
        trimEnd: endT,
        crop: cropVideo,
        speed: Number(speedSel.value),
        gif,
        preset,
        outputPath,
      },
    });
    setProgress(1);
    exports.unshift({
      kind: gif ? "GIF" : "MP4",
      path: outputPath,
      name: fileName(outputPath),
    });
    renderExports();
    updateSummary(`Saved ${gif ? "GIF" : "MP4"}. You can adjust and export again.`);
    toast(`${gif ? "GIF" : "MP4"} saved`);
  } catch (e) {
    if (cancelRequested) {
      updateSummary("Export cancelled");
      toast("Export cancelled");
    } else {
      updateSummary("Export failed");
      toast(`Export failed: ${e}`, "error");
    }
  } finally {
    setExporting(false);
    cancelRequested = false;
  }
}

exportMp4Btn.addEventListener("click", () => doExport(false));
exportGifBtn.addEventListener("click", () => doExport(true));
cancelExportBtn.addEventListener("click", async () => {
  if (!exporting) return;
  cancelRequested = true;
  updateSummary("Cancelling export...");
  try {
    await invoke("cancel_export");
  } catch (e) {
    toast(`Could not cancel export: ${e}`, "error");
  }
});
discardBtn.addEventListener("click", async () => {
  if (exports.length === 0) {
    const ok = typeof confirm === "function"
      ? await confirm("Discard this recording without saving an export?", { title: "Discard recording", kind: "warning" })
      : window.confirm("Discard this recording without saving an export?");
    if (!ok) return;
  }
  try {
    await invoke("discard_recording");
    await invoke("close_recorder");
  } catch (e) {
    toast(`Discard failed: ${e}`, "error");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.target?.matches?.("select, input, textarea")) return;
  if (event.code === "Space") {
    event.preventDefault();
    if (player.paused) player.play();
    else player.pause();
  } else if (event.key.toLowerCase() === "c") {
    cropToggle.click();
  } else if (event.key === "Enter") {
    doExport(false);
  }
});
