// Liseré rouge autour de la zone enregistrée. Interroge le backend pour la
// géométrie de la région (points logiques, relatifs au moniteur) et place la
// boîte ; l'outline CSS déborde à l'extérieur → jamais capturé dans la vidéo.
const { invoke } = window.__TAURI__.core;

(async function init() {
  try {
    const r = await invoke("recording_hud_info");
    const box = document.getElementById("box");
    box.style.left = `${r.x}px`;
    box.style.top = `${r.y}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
  } catch (e) {
    console.error("recording_hud_info failed:", e);
  }
})();
