"use strict";
// Deterministic ScreenShotPP demo renderer. Playwright calls window.seek(t_ms) per frame.

const cv = document.getElementById("fx");
const ctx = cv.getContext("2d");
const toolbar = document.getElementById("toolbar");
const picker = document.getElementById("color-picker");
const ocrPanel = document.getElementById("ocr-panel");
const outputSize = document.getElementById("output-size");
const dpr = window.devicePixelRatio || 1;
cv.width = 1280 * dpr;
cv.height = 720 * dpr;
cv.style.width = "1280px";
cv.style.height = "720px";
ctx.scale(dpr, dpr);

const PURPLE = "#7c3aed";
const SEL_BLUE = "#168cff";
const VEIL = "rgba(0,0,0,0.45)";

function rectOf(sel) {
  const r = document.querySelector(sel).getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

let G = null;

function build() {
  const sheet = rectOf(".sheet");
  const sel = { x: sheet.x + 12, y: sheet.y + 12, w: sheet.w - 24, h: sheet.h - 24 };
  toolbar.style.left = sel.x + "px";
  toolbar.style.top = (sel.y + sel.h + 8) + "px";

  const acct = rectOf("#acct");
  const rectAnn = { x: sel.x + 35, y: sel.y + 78, w: 235, h: 66 };
  const ellipseAnn = { x: sel.x + 312, y: sel.y + 79, w: 155, h: 64 };
  const lineAnn = { x1: sel.x + 520, y1: sel.y + 105, x2: sel.x + 735, y2: sel.y + 140 };
  const arrowAnn = { x1: sel.x + 524, y1: sel.y + 220, x2: sel.x + 785, y2: sel.y + 182 };
  const freeAnn = [
    [sel.x + 68, sel.y + 267], [sel.x + 104, sel.y + 238], [sel.x + 144, sel.y + 272],
    [sel.x + 184, sel.y + 240], [sel.x + 224, sel.y + 269], [sel.x + 260, sel.y + 243],
  ];
  const textAnn = { x: sel.x + 300, y: sel.y + 267, text: "Review before sharing" };
  const bubbleAnn = { x: sel.x + 785, y: sel.y + 292 };
  const mosAnn = { x: acct.x - 6, y: acct.y - 3, w: acct.w + 12, h: acct.h + 6 };
  const movedRect = { x: rectAnn.x + 30, y: rectAnn.y + 22, w: rectAnn.w, h: rectAnn.h };
  const btn = (s) => rectOf(s);
  G = {
    sel, rectAnn, ellipseAnn, lineAnn, arrowAnn, freeAnn, textAnn, bubbleAnn, mosAnn, movedRect,
    btnSelect: btn('[data-tool="select"]'), btnRect: btn('[data-tool="rect"]'),
    btnEllipse: btn('[data-tool="ellipse"]'), btnLine: btn('[data-tool="line"]'),
    btnArrow: btn('[data-tool="arrow"]'), btnFree: btn('[data-tool="free"]'),
    btnText: btn('[data-tool="text"]'), btnBubble: btn('[data-tool="bubble"]'),
    btnMosaic: btn('[data-tool="mosaic"]'), btnCustom: btn('#custom-color'),
    btnUndo: btn('#undo'), btnRedo: btn('#redo'), btnOutput: btn('#output-size'), btnOcr: btn('#ocr-btn'),
  };
  picker.style.left = Math.min(G.btnCustom.x, 1280 - 220) + "px";
  picker.style.top = (Number.parseFloat(toolbar.style.top) - 174) + "px";
}

// ---- timeline (ms): exhaustive 22-second README tutorial ----
const T = {
  cursorIn: 0, selStart: 350, selEnd: 1450, settle: 1750,
  colorOpen: 2050, pickerMove: 2550, hexType: 3150, pickerClose: 4050,
  rectHi: 4300, rectStart: 4550, rectEnd: 5200,
  ellipseHi: 5450, ellipseStart: 5700, ellipseEnd: 6350,
  lineHi: 6600, lineStart: 6850, lineEnd: 7400,
  arrowHi: 7650, arrowStart: 7900, arrowEnd: 8450,
  freeHi: 8700, freeStart: 8950, freeEnd: 9700,
  textHi: 9950, textStart: 10200, textEnd: 10950,
  bubbleHi: 11200, bubble: 11550,
  mosaicHi: 11900, mosaicStart: 12150, mosaicEnd: 12850,
  selectHi: 13100, moveStart: 13350, moveEnd: 14050,
  undoHi: 14350, undo: 14600, redoHi: 15100, redo: 15350,
  outputHi: 15800, outputPick: 16100, outputHold: 17000,
  ocrHi: 17400, ocrPanel: 17800, hold: 20800,
};

window.DEMO_CHECKPOINTS = {
  picker: T.hexType + 450,
  rectangle: T.rectEnd,
  ellipse: T.ellipseEnd,
  line: T.lineEnd,
  arrow: T.arrowEnd,
  pencil: T.freeEnd,
  text: T.textEnd,
  bubble: T.bubble + 220,
  mosaic: T.mosaicEnd,
  selectMove: T.moveEnd,
  undo: T.undo + 240,
  redo: T.redo + 240,
  output1mb: T.outputHold,
  ocr: T.hold,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

function cursorWaypoints() {
  const g = G;
  return [
    { t: T.cursorIn, x: 250, y: 250 },
    { t: T.selStart, x: g.sel.x, y: g.sel.y }, { t: T.selEnd, x: g.sel.x + g.sel.w, y: g.sel.y + g.sel.h },
    { t: T.colorOpen, x: g.btnCustom.cx, y: g.btnCustom.cy }, { t: T.pickerMove, x: g.btnCustom.cx + 46, y: g.btnCustom.cy - 120 },
    { t: T.hexType, x: g.btnCustom.cx + 105, y: g.btnCustom.cy - 32 }, { t: T.pickerClose, x: g.btnCustom.cx, y: g.btnCustom.cy },
    { t: T.rectHi, x: g.btnRect.cx, y: g.btnRect.cy }, { t: T.rectStart, x: g.rectAnn.x, y: g.rectAnn.y }, { t: T.rectEnd, x: g.rectAnn.x + g.rectAnn.w, y: g.rectAnn.y + g.rectAnn.h },
    { t: T.ellipseHi, x: g.btnEllipse.cx, y: g.btnEllipse.cy }, { t: T.ellipseStart, x: g.ellipseAnn.x, y: g.ellipseAnn.y }, { t: T.ellipseEnd, x: g.ellipseAnn.x + g.ellipseAnn.w, y: g.ellipseAnn.y + g.ellipseAnn.h },
    { t: T.lineHi, x: g.btnLine.cx, y: g.btnLine.cy }, { t: T.lineStart, x: g.lineAnn.x1, y: g.lineAnn.y1 }, { t: T.lineEnd, x: g.lineAnn.x2, y: g.lineAnn.y2 },
    { t: T.arrowHi, x: g.btnArrow.cx, y: g.btnArrow.cy }, { t: T.arrowStart, x: g.arrowAnn.x1, y: g.arrowAnn.y1 }, { t: T.arrowEnd, x: g.arrowAnn.x2, y: g.arrowAnn.y2 },
    { t: T.freeHi, x: g.btnFree.cx, y: g.btnFree.cy }, { t: T.freeStart, x: g.freeAnn[0][0], y: g.freeAnn[0][1] }, { t: T.freeEnd, x: g.freeAnn.at(-1)[0], y: g.freeAnn.at(-1)[1] },
    { t: T.textHi, x: g.btnText.cx, y: g.btnText.cy }, { t: T.textStart, x: g.textAnn.x, y: g.textAnn.y }, { t: T.textEnd, x: g.textAnn.x + 190, y: g.textAnn.y },
    { t: T.bubbleHi, x: g.btnBubble.cx, y: g.btnBubble.cy }, { t: T.bubble, x: g.bubbleAnn.x, y: g.bubbleAnn.y },
    { t: T.mosaicHi, x: g.btnMosaic.cx, y: g.btnMosaic.cy }, { t: T.mosaicStart, x: g.mosAnn.x, y: g.mosAnn.y }, { t: T.mosaicEnd, x: g.mosAnn.x + g.mosAnn.w, y: g.mosAnn.y + g.mosAnn.h },
    { t: T.selectHi, x: g.btnSelect.cx, y: g.btnSelect.cy }, { t: T.moveStart, x: g.rectAnn.x + g.rectAnn.w / 2, y: g.rectAnn.y + g.rectAnn.h / 2 }, { t: T.moveEnd, x: g.movedRect.x + g.movedRect.w / 2, y: g.movedRect.y + g.movedRect.h / 2 },
    { t: T.undoHi, x: g.btnUndo.cx, y: g.btnUndo.cy }, { t: T.undo, x: g.btnUndo.cx, y: g.btnUndo.cy }, { t: T.redoHi, x: g.btnRedo.cx, y: g.btnRedo.cy }, { t: T.redo, x: g.btnRedo.cx, y: g.btnRedo.cy },
    { t: T.outputHi, x: g.btnOutput.cx, y: g.btnOutput.cy }, { t: T.outputPick, x: g.btnOutput.cx, y: g.btnOutput.cy }, { t: T.outputHold, x: g.btnOutput.cx, y: g.btnOutput.cy },
    { t: T.ocrHi, x: g.btnOcr.cx, y: g.btnOcr.cy }, { t: T.ocrPanel, x: g.btnOcr.cx, y: g.btnOcr.cy }, { t: T.hold, x: g.btnOcr.cx, y: g.btnOcr.cy },
  ];
}

function cursorAt(t, wps) {
  if (t <= wps[0].t) return { x: wps[0].x, y: wps[0].y };
  for (let i = 1; i < wps.length; i++) {
    if (t <= wps[i].t) {
      const a = wps[i - 1], b = wps[i], p = easeInOut(prog(t, a.t, b.t));
      return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
    }
  }
  return { ...wps.at(-1) };
}

function isDrawing(t) {
  return (t >= T.selStart && t < T.selEnd) || (t >= T.rectStart && t < T.rectEnd)
    || (t >= T.ellipseStart && t < T.ellipseEnd) || (t >= T.lineStart && t < T.lineEnd)
    || (t >= T.arrowStart && t < T.arrowEnd) || (t >= T.freeStart && t < T.freeEnd)
    || (t >= T.mosaicStart && t < T.mosaicEnd) || (t >= T.moveStart && t < T.moveEnd);
}

function veil(sel, draft) {
  ctx.fillStyle = VEIL;
  ctx.fillRect(0, 0, 1280, sel.y); ctx.fillRect(0, sel.y, sel.x, sel.h);
  ctx.fillRect(sel.x + sel.w, sel.y, 1280 - sel.x - sel.w, sel.h); ctx.fillRect(0, sel.y + sel.h, 1280, 720 - sel.y - sel.h);
  ctx.strokeStyle = SEL_BLUE; ctx.lineWidth = 2; ctx.setLineDash(draft ? [6, 4] : []); ctx.strokeRect(sel.x, sel.y, sel.w, sel.h); ctx.setLineDash([]);
}
function strokeRect(r, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash([]); ctx.strokeRect(r.x, r.y, r.w, r.h); }
function strokeEllipse(r, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash([]); ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
function partialLine(a, reveal) { return { x1: a.x1, y1: a.y1, x2: lerp(a.x1, a.x2, reveal), y2: lerp(a.y1, a.y2, reveal) }; }
function strokeLine(a, color, w, arrow = false) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke();
  if (!arrow) return;
  const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), size = 13;
  ctx.beginPath(); ctx.moveTo(a.x2, a.y2); ctx.lineTo(a.x2 - size * Math.cos(angle - Math.PI / 6), a.y2 - size * Math.sin(angle - Math.PI / 6)); ctx.lineTo(a.x2 - size * Math.cos(angle + Math.PI / 6), a.y2 - size * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fill();
}
function strokeFree(points, reveal, color, w) { const count = Math.max(2, Math.ceil(points.length * reveal)); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); points.slice(0, count).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
function drawText(a, reveal, color) { ctx.fillStyle = color; ctx.font = "bold 20px Arial"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(a.text.slice(0, Math.ceil(a.text.length * reveal)), a.x, a.y); }
function hash(i) { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }
function mosaic(r) { const cell = 9; let n = 0; for (let y = r.y; y < r.y + r.h; y += cell) for (let x = r.x; x < r.x + r.w; x += cell) { const v = hash(n++), g = v > .6 ? 138 + Math.floor(v * 48) : 206 + Math.floor(v * 34); ctx.fillStyle = `rgb(${g},${g + 4},${g + 9})`; ctx.fillRect(x, y, Math.min(cell, r.x + r.w - x), Math.min(cell, r.y + r.h - y)); } }
function bubble(b, scale) { ctx.save(); ctx.translate(b.x, b.y); ctx.scale(scale, scale); ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fillStyle = PURPLE; ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "bold 16px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("1", 0, 1); ctx.restore(); }
function drawMoveHandles(r) { ctx.strokeStyle = SEL_BLUE; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10); ctx.setLineDash([]); }
function drawCursor(p, cross) { if (cross) { ctx.strokeStyle = "rgba(15,23,42,.85)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x - 11, p.y); ctx.lineTo(p.x + 11, p.y); ctx.moveTo(p.x, p.y - 11); ctx.lineTo(p.x, p.y + 11); ctx.stroke(); return; } ctx.save(); ctx.translate(p.x, p.y); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.5, 13); ctx.lineTo(7.5, 19.5); ctx.lineTo(10, 18.3); ctx.lineTo(7, 12); ctx.lineTo(12.5, 12); ctx.closePath(); ctx.fillStyle = "#0b0f14"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); }

function activeTool(t) {
  if (t >= T.rectHi && t < T.ellipseHi) return "rect";
  if (t >= T.ellipseHi && t < T.lineHi) return "ellipse";
  if (t >= T.lineHi && t < T.arrowHi) return "line";
  if (t >= T.arrowHi && t < T.freeHi) return "arrow";
  if (t >= T.freeHi && t < T.textHi) return "free";
  if (t >= T.textHi && t < T.bubbleHi) return "text";
  if (t >= T.bubbleHi && t < T.mosaicHi) return "bubble";
  if (t >= T.mosaicHi && t < T.selectHi) return "mosaic";
  if (t >= T.selectHi && t < T.undoHi) return "select";
  return null;
}
function renderControls(t) {
  document.querySelectorAll(".tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === activeTool(t)));
  document.getElementById("custom-color").classList.toggle("active", t >= T.colorOpen && t < T.pickerClose);
  document.getElementById("undo").classList.toggle("flash", t >= T.undoHi && t < T.redoHi);
  document.getElementById("redo").classList.toggle("flash", t >= T.redoHi && t < T.outputHi);
  document.getElementById("ocr-btn").classList.toggle("active", t >= T.ocrHi);
  outputSize.selectedIndex = t >= T.outputPick ? 3 : 0;
  outputSize.classList.toggle("changed", t >= T.outputHi && t < T.ocrHi);
  picker.hidden = !(t >= T.colorOpen && t < T.pickerClose);
  const pv = prog(t, T.colorOpen, T.colorOpen + 220);
  picker.style.opacity = String(pv); picker.style.transform = `scale(${lerp(.96, 1, pv)})`;
  document.querySelector(".cp-sv-cursor").style.left = lerp(72, 82, prog(t, T.colorOpen, T.pickerMove)) + "%";
  document.querySelector(".cp-sv-cursor").style.top = lerp(42, 26, prog(t, T.colorOpen, T.pickerMove)) + "%";
  document.querySelector(".cp-hue-cursor").style.left = lerp(8, 75, prog(t, T.colorOpen, T.pickerMove)) + "%";
  document.querySelector(".cp-hex").value = t < T.hexType ? "#ff8800" : PURPLE;
  document.querySelector(".cp-preview").style.background = t < T.hexType ? "#ff8800" : PURPLE;
  document.getElementById("custom-color").style.background = t < T.hexType ? "#ff8800" : PURPLE;
  const ov = prog(t, T.ocrPanel, T.ocrPanel + 260);
  ocrPanel.style.opacity = String(ov); ocrPanel.style.transform = `translate(-50%,-50%) scale(${lerp(.96, 1, ov)})`;
}

function currentRect(t) {
  if (t < T.moveStart) return G.rectAnn;
  if (t < T.moveEnd) { const p = easeInOut(prog(t, T.moveStart, T.moveEnd)); return { x: lerp(G.rectAnn.x, G.movedRect.x, p), y: lerp(G.rectAnn.y, G.movedRect.y, p), w: G.rectAnn.w, h: G.rectAnn.h }; }
  if (t >= T.undo && t < T.redo) return G.rectAnn;
  return G.movedRect;
}

window.seek = function (t) {
  if (!G) build();
  const g = G;
  ctx.clearRect(0, 0, 1280, 720);
  const tv = prog(t, T.selEnd, T.settle);
  toolbar.style.opacity = String(tv); toolbar.style.transform = `scale(${lerp(.96, 1, tv)})`;
  renderControls(t);

  if (t >= T.selStart && t < T.selEnd) { const p = easeInOut(prog(t, T.selStart, T.selEnd)); veil({ x: g.sel.x, y: g.sel.y, w: g.sel.w * p, h: g.sel.h * p }, true); }
  else if (t >= T.selEnd) veil(g.sel, false);

  if (t >= T.selEnd) {
    ctx.save(); ctx.beginPath(); ctx.rect(g.sel.x, g.sel.y, g.sel.w, g.sel.h); ctx.clip();
    if (t >= T.rectStart) { const r = currentRect(t), p = easeInOut(prog(t, T.rectStart, T.rectEnd)); strokeRect({ ...r, w: r.w * p }, PURPLE, 3); }
    if (t >= T.ellipseStart) { const p = easeInOut(prog(t, T.ellipseStart, T.ellipseEnd)); strokeEllipse({ ...g.ellipseAnn, w: g.ellipseAnn.w * p }, PURPLE, 3); }
    if (t >= T.lineStart) strokeLine(partialLine(g.lineAnn, easeInOut(prog(t, T.lineStart, T.lineEnd))), PURPLE, 3);
    if (t >= T.arrowStart) strokeLine(partialLine(g.arrowAnn, easeInOut(prog(t, T.arrowStart, T.arrowEnd))), PURPLE, 3, true);
    if (t >= T.freeStart) strokeFree(g.freeAnn, prog(t, T.freeStart, T.freeEnd), PURPLE, 4);
    if (t >= T.textStart) drawText(g.textAnn, prog(t, T.textStart, T.textEnd), PURPLE);
    if (t >= T.bubble) bubble(g.bubbleAnn, easeOutBack(prog(t, T.bubble, T.bubble + 220)));
    if (t >= T.mosaicStart) { const p = easeInOut(prog(t, T.mosaicStart, T.mosaicEnd)); mosaic({ ...g.mosAnn, w: g.mosAnn.w * p }); }
    if (t >= T.selectHi && t < T.undoHi) drawMoveHandles(currentRect(t));
    ctx.restore();
  }
  drawCursor(cursorAt(t, cursorWaypoints()), isDrawing(t));
};

window.demoState = function (t) {
  return {
    pickerOpen: !picker.hidden,
    hex: document.querySelector(".cp-hex").value,
    active: document.querySelector(".tool.active")?.dataset.tool || null,
    output: outputSize.value,
    ocrVisible: Number(ocrPanel.style.opacity) > .9,
    rectMoved: currentRect(t).x === G.movedRect.x,
    undoFlash: document.getElementById("undo").classList.contains("flash"),
    redoFlash: document.getElementById("redo").classList.contains("flash"),
    duration: window.DEMO_DURATION,
  };
};
window.DEMO_DURATION = T.hold;

(async function init() {
  document.getElementById("ocr-text").value =
`Quarterly Income Statement
Period ending March 31, 2026 · All amounts in USD
Northwind Analytics

Line item               Q1 2026    Q4 2025   Change
Subscription revenue    842,300    781,450   +7.8%
Services revenue        196,720    203,100   -3.1%
Cost of goods sold     -274,860   -268,940   +2.2%
Sales and marketing    -188,400   -172,300   +9.3%
Research & development -211,050   -205,600   +2.6%
Net operating income    267,930    243,990   +9.8%`;
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
  build(); window.seek(0); window.__demoReady = true;
})();
