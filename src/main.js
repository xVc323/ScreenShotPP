import { keyEventToAccelerator } from "./accelerator.js";

const { invoke } = window.__TAURI__.core;
const dialog = window.__TAURI__.dialog;

const shortcutBtn = document.getElementById("shortcut");
const folderEl = document.getElementById("folder");
const formatSel = document.getElementById("format");
const langSel = document.getElementById("ocr-language");
const launchAtLogin = document.getElementById("launch-at-login");

let settings = await invoke("get_settings");
render();
document.getElementById("version").textContent = await invoke("app_version");

function render() {
  shortcutBtn.textContent = settings.capture_shortcut;
  folderEl.textContent = settings.default_save_folder || "Desktop";
  formatSel.value = settings.default_format;
  langSel.value = settings.ocr_language;
  launchAtLogin.checked = !!settings.launch_at_login;
}

async function persist() {
  try {
    await invoke("update_settings", { newSettings: settings });
  } catch (error) {
    console.error("update_settings failed:", error);
    window.alert("Could not save settings: " + error);
  }
}

// Enregistreur de touches pour le raccourci.
let recording = false;
shortcutBtn.addEventListener("click", () => {
  recording = true;
  shortcutBtn.textContent = "Press a combination…";
});
window.addEventListener("keydown", async (event) => {
  if (!recording) return;
  event.preventDefault();
  if (event.key === "Escape") {
    recording = false;
    render();
    return;
  }
  const accelerator = keyEventToAccelerator(event);
  if (!accelerator) return; // attend une vraie touche (pas que des modificateurs)
  recording = false;
  settings = { ...settings, capture_shortcut: accelerator };
  render();
  await persist();
});

document.getElementById("choose-folder").addEventListener("click", async () => {
  const dir = await dialog.open({ directory: true });
  if (!dir) return;
  settings = { ...settings, default_save_folder: dir };
  render();
  await persist();
});

formatSel.addEventListener("change", async () => {
  settings = { ...settings, default_format: formatSel.value };
  await persist();
});

langSel.addEventListener("change", async () => {
  settings = { ...settings, ocr_language: langSel.value };
  await persist();
});

launchAtLogin.addEventListener("change", async () => {
  settings = { ...settings, launch_at_login: launchAtLogin.checked };
  await persist();
});
