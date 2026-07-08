// Barre de contrôle de l'enregistrement : chrono, pause/reprise, stop. Le temps
// affiché est un temps de paroi qui n'avance pas pendant la pause (approxime la
// durée réellement enregistrée, somme des segments). Les actions délèguent au
// backend (pause_recording / resume_recording / stop_recording).
const { invoke } = window.__TAURI__.core;

const dot = document.getElementById("dot");
const timeEl = document.getElementById("time");
const pauseBtn = document.getElementById("pause");
const stopBtn = document.getElementById("stop");

let paused = false;
let busy = false;
let elapsed = 0; // secondes enregistrées (hors pauses)
let last = Date.now();

function fmt(total) {
  const s = Math.floor(total);
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

setInterval(() => {
  const now = Date.now();
  if (!paused) elapsed += (now - last) / 1000;
  last = now;
  timeEl.textContent = fmt(elapsed);
}, 200);

pauseBtn.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try {
    if (!paused) {
      await invoke("pause_recording");
      paused = true;
      pauseBtn.textContent = "Resume";
      dot.classList.add("paused");
    } else {
      await invoke("resume_recording");
      paused = false;
      pauseBtn.textContent = "Pause";
      dot.classList.remove("paused");
    }
  } catch (e) {
    console.error("pause/resume failed:", e);
  } finally {
    // Recale l'horloge pour ne pas compter le temps de l'aller-retour backend.
    last = Date.now();
    busy = false;
  }
});

stopBtn.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try {
    // Le backend ferme cette fenêtre et ouvre le mini-éditeur.
    await invoke("stop_recording");
  } catch (e) {
    console.error("stop failed:", e);
    busy = false;
  }
});
