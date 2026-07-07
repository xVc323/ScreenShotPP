// Mini-éditeur d'enregistrement (côté webview) : lecture du fichier temporaire,
// timeline avec crochets de trim draggables, boîte de crop redimensionnable,
// export MP4/GIF. La logique pure (trim/crop) vit dans trim.js / crop.js.
import { clampTrim, effectiveDuration } from "./trim.js";
import { clampCrop, displayToVideo } from "./crop.js";

const { invoke, convertFileSrc } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { save } = window.__TAURI__.dialog;

const player = document.getElementById("player");
const track = document.getElementById("track");
const rangeEl = document.getElementById("range");
const playhead = document.getElementById("playhead");
const hStart = document.getElementById("h-start");
const hEnd = document.getElementById("h-end");
const tStartEl = document.getElementById("t-start");
const tEndEl = document.getElementById("t-end");
const tDurEl = document.getElementById("t-dur");
const speedSel = document.getElementById("speed");
const progress = document.getElementById("export-progress");
const cropBox = document.getElementById("crop-box");
const cropToggle = document.getElementById("crop-toggle");

let sourcePath = null;
let crop = null; // rect en espace d'affichage du <video>, null = pas de crop
let duration = 0;
let startT = 0;
let endT = 0;

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
    alert(`Could not load recording: ${e}`);
    return;
  }
  player.addEventListener("loadedmetadata", () => {
    duration = player.duration || 0;
    startT = 0;
    endT = duration;
    renderTimeline();
    renderCrop();
  });
  await listen("export-progress", (e) => {
    // Le backend émet le timestamp de SORTIE ffmpeg, comprimé par setpts=PTS/speed.
    // On borne donc sur la durée effective (durée source / vitesse), pas la source.
    const total = effectiveDuration(startT, endT, Number(speedSel.value));
    progress.value = total > 0 ? Math.min(1, e.payload / total) : 0;
  });
})();

// ---- Timeline / trim ------------------------------------------------------

function pct(t) {
  return duration > 0 ? (t / duration) * 100 : 0;
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

speedSel.addEventListener("change", renderTimeline);

// ---- Crop -----------------------------------------------------------------
// `crop` est en pixels d'affichage du <video> (0..clientWidth/Height). À
// l'export, displayToVideo() le convertit en pixels vidéo réels.

/** Positionne #crop-box par-dessus la vidéo (letterboxée dans #stage). */
function renderCrop() {
  if (!crop) {
    cropBox.hidden = true;
    return;
  }
  crop = clampCrop(crop, player.clientWidth, player.clientHeight);
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
  const suggested = sourcePath.replace(/\.mp4$/, gif ? ".gif" : "-edited.mp4");
  const outputPath = await save({ defaultPath: suggested });
  if (!outputPath) return;
  progress.value = 0;
  progress.hidden = false;
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
        outputPath,
      },
    });
    window.close();
  } catch (e) {
    alert(`Export failed: ${e}`);
  } finally {
    progress.hidden = true;
  }
}

document.getElementById("export-mp4").addEventListener("click", () => doExport(false));
document.getElementById("export-gif").addEventListener("click", () => doExport(true));
document.getElementById("discard").addEventListener("click", async () => {
  try {
    await invoke("discard_recording");
  } catch (_) {}
  window.close();
});
