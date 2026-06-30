const { listen } = window.__TAURI__.event;
const el = document.getElementById("count");

listen("countdown-tick", (event) => {
  el.textContent = String(event.payload);
});
