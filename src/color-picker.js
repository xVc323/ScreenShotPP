import { hsvToHex, hexToHsv } from "./editor/color.js";

// Sélecteur de couleur rendu dans l'overlay (carré saturation/valeur + curseur de
// teinte + champ hex). Indépendant du panneau natif de l'OS (qui s'ouvrirait derrière
// l'overlay plein écran).
export function createColorPicker({ button, initialHex = "#ff0000", onChange }) {
  let { h, s, v } = hexToHsv(initialHex) || { h: 0, s: 1, v: 1 };

  const pop = el("div", "cp-popover");
  pop.hidden = true;
  const sv = el("div", "cp-sv");
  const svCursor = el("div", "cp-sv-cursor");
  sv.appendChild(svCursor);
  const hue = el("div", "cp-hue");
  const hueCursor = el("div", "cp-hue-cursor");
  hue.appendChild(hueCursor);
  const row = el("div", "cp-row");
  const preview = el("span", "cp-preview");
  const hexInput = el("input", "cp-hex");
  hexInput.type = "text";
  hexInput.maxLength = 7;
  hexInput.spellcheck = false;
  row.append(preview, hexInput);
  pop.append(sv, hue, row);
  document.body.appendChild(pop);

  const currentHex = () => hsvToHex(h, s, v);

  function render(skipHexInput) {
    sv.style.background =
      `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), ${hsvToHex(h, 1, 1)}`;
    svCursor.style.left = `${s * 100}%`;
    svCursor.style.top = `${(1 - v) * 100}%`;
    hueCursor.style.left = `${(h / 360) * 100}%`;
    const hex = currentHex();
    preview.style.background = hex;
    button.style.background = hex;
    if (!skipHexInput) hexInput.value = hex;
  }

  const emit = () => onChange && onChange(currentHex());

  bindDrag(sv, (x, y, rect) => {
    s = clamp01((x - rect.left) / rect.width);
    v = 1 - clamp01((y - rect.top) / rect.height);
    render();
    emit();
  });
  bindDrag(hue, (x, _y, rect) => {
    h = clamp01((x - rect.left) / rect.width) * 360;
    render();
    emit();
  });

  hexInput.addEventListener("input", () => {
    const parsed = hexToHsv(hexInput.value);
    if (!parsed) return;
    ({ h, s, v } = parsed);
    render(true);
    emit();
  });

  function onDocPointerDown(event) {
    if (event.target === button || button.contains(event.target) || pop.contains(event.target)) return;
    close();
  }
  function onKey(event) {
    if (event.key === "Escape") close();
  }

  function open() {
    const rect = button.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
    pop.style.top = `${rect.bottom + 8}px`;
    pop.hidden = false;
    render();
    document.addEventListener("pointerdown", onDocPointerDown, true);
    window.addEventListener("keydown", onKey, true);
  }
  function close() {
    if (pop.hidden) return;
    pop.hidden = true;
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    window.removeEventListener("keydown", onKey, true);
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    pop.hidden ? open() : close();
  });

  render();
  return {
    getHex: currentHex,
    setHex(hex) {
      const parsed = hexToHsv(hex);
      if (parsed) ({ h, s, v } = parsed), render();
    },
    close,
  };
}

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function bindDrag(target, onMove) {
  let active = false;
  const handle = (event) => onMove(event.clientX, event.clientY, target.getBoundingClientRect());
  target.addEventListener("pointerdown", (event) => {
    active = true;
    target.setPointerCapture(event.pointerId);
    handle(event);
    event.preventDefault();
  });
  target.addEventListener("pointermove", (event) => {
    if (active) handle(event);
  });
  target.addEventListener("pointerup", (event) => {
    active = false;
    try { target.releasePointerCapture(event.pointerId); } catch (_) {}
  });
}
