const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);
const NAMED = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Escape",
  Enter: "Enter",
  Tab: "Tab",
};

/**
 * Construit une chaîne d'accélérateur Tauri ("CmdOrCtrl+Shift+2") depuis un
 * événement clavier, ou `null` si seuls des modificateurs sont pressés.
 */
export function keyEventToAccelerator(event) {
  const mods = [];
  if (event.metaKey) mods.push("CmdOrCtrl");
  if (event.ctrlKey && !event.metaKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  const main = mainKey(event);
  if (!main) return null;
  return [...mods, main].join("+");
}

function mainKey(event) {
  const k = event.key;
  if (MODIFIER_KEYS.has(k)) return null;
  if (NAMED[k]) return NAMED[k];
  if (/^[a-z]$/i.test(k)) return k.toUpperCase();
  if (/^[0-9]$/.test(k)) return k;
  if (/^F[0-9]{1,2}$/.test(k)) return k;
  const code = event.code || "";
  if (/^Digit[0-9]$/.test(code)) return code.replace("Digit", "");
  if (/^Key[A-Z]$/.test(code)) return code.replace("Key", "");
  return null;
}
