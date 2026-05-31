"use strict";
// Deterministic ScreenShotPP demo renderer. Playwright calls window.seek(t_ms) per frame.

const cv = document.getElementById("fx");
const ctx = cv.getContext("2d");
const toolbar = document.getElementById("toolbar");
const ocrPanel = document.getElementById("ocr-panel");
const dpr = window.devicePixelRatio || 1;
cv.width = 1280 * dpr;
cv.height = 720 * dpr;
cv.style.width = "1280px";
cv.style.height = "720px";
ctx.scale(dpr, dpr);

const RED = "#e5484d";
const SEL_BLUE = "#168cff";
const VEIL = "rgba(0,0,0,0.45)";

function rectOf(sel) { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }

let G = null; // geometry, filled on init

function build() {
  const sheet = rectOf(".sheet");
  const sel = { x: sheet.x + 12, y: sheet.y + 12, w: sheet.w - 24, h: sheet.h - 24 };

  // place toolbar below selection (like positionAndShowToolbar)
  toolbar.style.left = sel.x + "px";
  toolbar.style.top = (sel.y + sel.h + 8) + "px";

  const acct = rectOf("#acct");
  const tot = rectOf("#rtot");
  const r2 = rectOf("#r2"), r3 = rectOf("#r3"), r4 = rectOf("#r4");

  const rectAnn = { x: tot.x + 16, y: tot.y + 1, w: tot.w - 32, h: tot.h - 2 };
  const mosAnn = { x: acct.x - 6, y: acct.y - 3, w: acct.w + 12, h: acct.h + 6 };
  const bx = sel.x + 26;
  const bubbles = [
    { x: bx, y: r2.cy },
    { x: bx, y: r3.cy },
    { x: bx, y: r4.cy },
  ];
  const label = { dx: 96, dy: -52, text: "Biggest jump +9.3%" };

  const btn = (s) => rectOf(s);
  G = {
    sel, rectAnn, mosAnn, bubbles, label,
    btnRect: btn('[data-tool="rect"]'),
    btnMos: btn('[data-tool="mosaic"]'),
    btnBub: btn('[data-tool="bubble"]'),
    btnSel: btn('[data-tool="select"]'),
    btnOcr: btn('#ocr-btn'),
  };
}

// ---- timeline (ms) ----
const T = {
  cursorIn: 0, selStart: 350, selEnd: 1400, settle: 1750,
  rectHi: 1950, rectStart: 2200, rectEnd: 2950,
  mosHi: 3200, mosStart: 3450, mosEnd: 4200,
  bubHi: 4450, bub1: 4800, bub2: 5200, bub3: 5600,
  dbl: 6050, labelStart: 6250, labelEnd: 7000,
  ocrHi: 7400, ocrPanel: 7650, hold: 9600,
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
    { t: T.selStart, x: g.sel.x, y: g.sel.y },
    { t: T.selEnd, x: g.sel.x + g.sel.w, y: g.sel.y + g.sel.h },
    { t: T.rectHi, x: g.btnRect.cx, y: g.btnRect.cy },
    { t: T.rectStart, x: g.rectAnn.x, y: g.rectAnn.y },
    { t: T.rectEnd, x: g.rectAnn.x + g.rectAnn.w, y: g.rectAnn.y + g.rectAnn.h },
    { t: T.mosHi, x: g.btnMos.cx, y: g.btnMos.cy },
    { t: T.mosStart, x: g.mosAnn.x, y: g.mosAnn.y },
    { t: T.mosEnd, x: g.mosAnn.x + g.mosAnn.w, y: g.mosAnn.y + g.mosAnn.h },
    { t: T.bubHi, x: g.btnBub.cx, y: g.btnBub.cy },
    { t: T.bub1, x: g.bubbles[0].x, y: g.bubbles[0].y },
    { t: T.bub2, x: g.bubbles[1].x, y: g.bubbles[1].y },
    { t: T.bub3, x: g.bubbles[2].x, y: g.bubbles[2].y },
    { t: T.dbl, x: g.bubbles[1].x, y: g.bubbles[1].y },
    { t: T.ocrHi, x: g.btnOcr.cx, y: g.btnOcr.cy },
    { t: T.ocrPanel, x: g.btnOcr.cx, y: g.btnOcr.cy },
    { t: T.hold, x: g.btnOcr.cx, y: g.btnOcr.cy },
  ];
}

function cursorAt(t, wps) {
  if (t <= wps[0].t) return { x: wps[0].x, y: wps[0].y };
  for (let i = 1; i < wps.length; i++) {
    if (t <= wps[i].t) {
      const a = wps[i - 1], b = wps[i];
      const p = easeInOut(prog(t, a.t, b.t));
      return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
    }
  }
  const last = wps[wps.length - 1];
  return { x: last.x, y: last.y };
}

// is the cursor "drawing" (crosshair) at time t?
function isDrawing(t) {
  return (t >= T.selStart && t < T.selEnd)
    || (t >= T.rectStart && t < T.rectEnd)
    || (t >= T.mosStart && t < T.mosEnd)
    || (Math.abs(t - T.bub1) < 160) || (Math.abs(t - T.bub2) < 160) || (Math.abs(t - T.bub3) < 160);
}

function veil(sel, draft) {
  ctx.fillStyle = VEIL;
  ctx.fillRect(0, 0, 1280, sel.y);
  ctx.fillRect(0, sel.y, sel.x, sel.h);
  ctx.fillRect(sel.x + sel.w, sel.y, 1280 - sel.x - sel.w, sel.h);
  ctx.fillRect(0, sel.y + sel.h, 1280, 720 - sel.y - sel.h);
  ctx.strokeStyle = SEL_BLUE; ctx.lineWidth = 2;
  ctx.setLineDash(draft ? [6, 4] : []);
  ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
  ctx.setLineDash([]);
}

function strokeRect(r, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash([]);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}

function hash(i) { let x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }
function mosaic(r) {
  const cell = 9;
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y += cell) {
    for (let x = r.x; x < r.x + r.w; x += cell) {
      const v = hash(n++);
      let g;
      if (v > 0.6) g = 138 + Math.floor(v * 48); else g = 206 + Math.floor(v * 34);
      ctx.fillStyle = `rgb(${g},${g + 4},${g + 9})`;
      ctx.fillRect(x, y, Math.min(cell, r.x + r.w - x), Math.min(cell, r.y + r.h - y));
    }
  }
}

function bubble(b, num, scale) {
  const R = 15;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(scale, scale);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 16px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(num), 0, 1);
  ctx.restore();
}

function labelBox(b, label, reveal) {
  const full = label.text;
  const shown = full.slice(0, Math.ceil(full.length * reveal));
  const bx = b.x + label.dx, by = b.y + label.dy;
  // connector
  ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(b.x, b.y); ctx.stroke();
  // box
  ctx.font = "14px Arial"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const tw = ctx.measureText(full).width, th = 16, pad = 6;
  const rx = bx - tw / 2 - pad, ry = by - th / 2 - pad, rw = tw + pad * 2, rh = th + pad * 2;
  roundRect(rx, ry, rw, rh, 5); ctx.fillStyle = "#0d1117"; ctx.fill();
  ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#e6edf3"; ctx.fillText(shown, bx - tw / 2, by + 1);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCursor(p, cross) {
  if (cross) {
    ctx.strokeStyle = "rgba(15,23,42,0.85)"; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p.x - 11, p.y); ctx.lineTo(p.x + 11, p.y);
    ctx.moveTo(p.x, p.y - 11); ctx.lineTo(p.x, p.y + 11);
    ctx.stroke();
  } else {
    // arrow pointer
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.5, 13); ctx.lineTo(7.5, 19.5);
    ctx.lineTo(10, 18.3); ctx.lineTo(7, 12); ctx.lineTo(12.5, 12); ctx.closePath();
    ctx.fillStyle = "#0b0f14"; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
}

function setActive(t) {
  document.querySelectorAll(".tool").forEach((b) => b.classList.remove("active"));
  document.getElementById("ocr-btn").classList.remove("active");
  let which = null;
  if (t >= T.settle && t < T.rectHi) which = "select";
  else if (t >= T.rectHi && t < T.mosHi) which = "rect";
  else if (t >= T.mosHi && t < T.bubHi) which = "mosaic";
  else if (t >= T.bubHi && t < T.ocrHi) which = "bubble";
  if (which) { const el = document.querySelector(`[data-tool="${which}"]`); if (el) el.classList.add("active"); }
  if (t >= T.ocrHi) document.getElementById("ocr-btn").classList.add("active");
}

window.seek = function (t) {
  if (!G) build();
  const g = G;
  ctx.clearRect(0, 0, 1280, 720);

  // toolbar visibility
  const tv = prog(t, T.selEnd, T.settle);
  toolbar.style.opacity = String(tv);
  toolbar.style.transform = `scale(${lerp(0.96, 1, tv)})`;
  setActive(t);

  // ocr panel
  const ov = prog(t, T.ocrPanel, T.ocrPanel + 260);
  ocrPanel.style.opacity = String(ov);
  ocrPanel.style.transform = `translate(-50%,-50%) scale(${lerp(0.96, 1, ov)})`;

  // selection veil
  let sel = g.sel, draft = false;
  if (t < T.selStart) {
    // nothing yet
  } else if (t < T.selEnd) {
    const p = easeInOut(prog(t, T.selStart, T.selEnd));
    sel = { x: g.sel.x, y: g.sel.y, w: g.sel.w * p, h: g.sel.h * p };
    draft = true;
    veil(sel, draft);
  } else {
    veil(g.sel, false);
  }

  // annotations clipped to selection
  if (t >= T.selEnd) {
    ctx.save();
    ctx.beginPath(); ctx.rect(g.sel.x, g.sel.y, g.sel.w, g.sel.h); ctx.clip();

    // rectangle
    if (t >= T.rectStart) {
      const p = easeInOut(prog(t, T.rectStart, T.rectEnd));
      strokeRect({ x: g.rectAnn.x, y: g.rectAnn.y, w: g.rectAnn.w * p, h: g.rectAnn.h }, RED, 3);
    }
    // mosaic
    if (t >= T.mosStart) {
      const p = easeInOut(prog(t, T.mosStart, T.mosEnd));
      mosaic({ x: g.mosAnn.x, y: g.mosAnn.y, w: g.mosAnn.w * p, h: g.mosAnn.h });
    }
    // label (drawn before bubbles so bubble sits on top of connector end)
    if (t >= T.labelStart) {
      const reveal = prog(t, T.labelStart, T.labelEnd);
      labelBox(g.bubbles[1], g.label, reveal);
    }
    // bubbles
    const bt = [T.bub1, T.bub2, T.bub3];
    for (let i = 0; i < 3; i++) {
      if (t >= bt[i]) {
        const s = easeOutBack(prog(t, bt[i], bt[i] + 220));
        bubble(g.bubbles[i], i + 1, s);
      }
    }
    ctx.restore();
  }

  // cursor on top
  const wps = cursorWaypoints();
  drawCursor(cursorAt(t, wps), isDrawing(t));
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
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
  build();
  window.seek(0);
  window.__demoReady = true;
})();
