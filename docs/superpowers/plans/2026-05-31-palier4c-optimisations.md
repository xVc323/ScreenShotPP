# Palier 4c — Optimisations & robustesse — Implementation Plan

> Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Protocole `capture://` (image d'affichage sans limite de taille + latence réduite) + capture de l'écran sous le curseur.

Branche : `palier-4c-optimisations`.

---

## Task 1: `capture.rs` — `monitor_at` (TDD) + `capture_at`

**Files:** Modify `src-tauri/src/capture.rs`

- [ ] **Step 1: types + tests** — ajouter dans `capture.rs` (et tests dans le mod tests) :
```rust
/// Rectangle d'un moniteur en pixels physiques globaux.
#[derive(Debug, Clone, Copy)]
pub struct MonitorRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Index du premier moniteur contenant le point (x, y), ou None.
pub fn monitor_at(rects: &[MonitorRect], x: i32, y: i32) -> Option<usize> {
    rects.iter().position(|m| {
        x >= m.x && x < m.x + m.width as i32 && y >= m.y && y < m.y + m.height as i32
    })
}
```
Tests :
```rust
    #[test]
    fn monitor_at_finds_the_monitor_containing_the_point() {
        let rects = [
            MonitorRect { x: 0, y: 0, width: 1000, height: 1000 },
            MonitorRect { x: 1000, y: 0, width: 800, height: 600 },
        ];
        assert_eq!(monitor_at(&rects, 500, 500), Some(0));
        assert_eq!(monitor_at(&rects, 1200, 100), Some(1));
        assert_eq!(monitor_at(&rects, 5000, 5000), None);
        assert_eq!(monitor_at(&rects, 1000, 0), Some(1)); // bord gauche du 2e
    }
```

- [ ] **Step 2: `capture_at`** — capture le moniteur sous un point (repli primaire) :
```rust
/// Capture le moniteur contenant (x, y), ou le moniteur principal en repli.
pub fn capture_at(x: i32, y: i32) -> Result<RgbaImage, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let rects: Vec<MonitorRect> = monitors
        .iter()
        .map(|m| MonitorRect {
            x: m.x().unwrap_or(0),
            y: m.y().unwrap_or(0),
            width: m.width().unwrap_or(0),
            height: m.height().unwrap_or(0),
        })
        .collect();
    let idx = monitor_at(&rects, x, y).unwrap_or_else(|| {
        monitors
            .iter()
            .position(|m| m.is_primary().unwrap_or(false))
            .unwrap_or(0)
    });
    monitors
        .get(idx)
        .ok_or("Aucun moniteur")?
        .capture_image()
        .map_err(|e| e.to_string())
}
```
(Si `m.x()`/`m.width()` ne renvoient pas `Result` dans la version xcap installée, retirer
les `.unwrap_or(...)`. Adapter au besoin.)

- [ ] **Step 3:** `cargo test --manifest-path src-tauri/Cargo.toml capture::` → vert. **commit.**

---

## Task 2: `commands.rs` — capture sous le curseur + épinglage + retrait data URL

**Files:** Modify `src-tauri/src/commands.rs`

- [ ] **Step 1: `start_capture`** — récupérer le curseur, capturer cet écran, épingler
l'overlay au moniteur Tauri sous le curseur. Remplacer le corps :
```rust
pub fn start_capture(app: AppHandle) -> Result<(), String> {
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    let (cx, cy) = (cursor.x as i32, cursor.y as i32);
    let img = capture::capture_at(cx, cy)?;
    {
        let state = app.state::<CaptureState>();
        *state.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(img);
    }
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window("overlay") {
            let _ = w.close();
        }
        let mut builder = WebviewWindowBuilder::new(&app2, "overlay", WebviewUrl::App("overlay.html".into()))
            .title("ScreenShotPP Overlay")
            .always_on_top(true)
            .decorations(false)
            .skip_taskbar(true)
            .focused(true)
            .resizable(false)
            .background_color(tauri::webview::Color(0, 0, 0, 255));

        // Moniteur Tauri sous le curseur (pour épingler l'overlay).
        let monitors = app2.available_monitors().unwrap_or_default();
        let rects: Vec<capture::MonitorRect> = monitors
            .iter()
            .map(|m| {
                let p = m.position();
                let s = m.size();
                capture::MonitorRect { x: p.x, y: p.y, width: s.width, height: s.height }
            })
            .collect();
        let target = capture::monitor_at(&rects, cx, cy)
            .and_then(|i| monitors.get(i))
            .or_else(|| app2.primary_monitor().ok().flatten().as_ref().and(monitors.first()));

        match target {
            Some(monitor) => {
                let pos = monitor.position();
                let size = monitor.size();
                let sf = monitor.scale_factor();
                builder = builder
                    .inner_size(size.width as f64 / sf, size.height as f64 / sf)
                    .position(pos.x as f64 / sf, pos.y as f64 / sf);
            }
            None => {
                builder = builder.fullscreen(true);
            }
        }

        if let Err(e) = builder.build() {
            eprintln!("Création de l'overlay échouée: {e}");
        }
    })
    .map_err(|e| e.to_string())
}
```
(Note : le repli `or_else` ci-dessus est approximatif ; si l'emprunt pose problème,
simplifier en : `target = monitor_at(...).and_then(|i| monitors.get(i)).or(monitors.first());`.)

- [ ] **Step 2: retirer `get_capture_data_url`** — supprimer la commande dans `commands.rs`
et son entrée dans le `invoke_handler` de `lib.rs`. (`encode_png_fast` redevient utilisé par
le protocole → plus de warning.)

- [ ] **Step 3:** `cargo build` ; **commit.**

---

## Task 3: `lib.rs` — protocole `capture://`

**Files:** Modify `src-tauri/src/lib.rs`

- [ ] **Step 1:** sur le `tauri::Builder`, avant `.setup(`, ajouter :
```rust
        .register_uri_scheme_protocol("capture", |ctx, _request| {
            use tauri::Manager;
            let app = ctx.app_handle();
            let guard = app
                .state::<CaptureState>()
                .0
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            match guard.as_ref() {
                Some(img) => match storage::encode_png_fast(img) {
                    Ok(png) => tauri::http::Response::builder()
                        .header("Content-Type", "image/png")
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Cache-Control", "no-store")
                        .body(png)
                        .unwrap(),
                    Err(_) => tauri::http::Response::builder().status(500).body(Vec::new()).unwrap(),
                },
                None => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap(),
            }
        })
```
Adapter le type de retour si le compilateur l'exige (Tauri 2 : `http::Response<Vec<u8>>` ou
`Cow<'static, [u8]>` ; consulter https://v2.tauri.app si erreur).

- [ ] **Step 2:** `cargo build` ; **commit.**

---

## Task 4: `overlay.js` — chargement via `capture://`

**Files:** Modify `src/overlay.js`

- [ ] **Step 1:** remplacer la récupération de l'image au démarrage :
```js
    const base = navigator.userAgent.includes("Windows") ? "http://capture.localhost" : "capture://localhost";
    const image = await loadImage(base + "/current?t=" + Date.now());
```
(supprimer l'appel `invoke("get_capture_data_url")`).

- [ ] **Step 2:** dans `loadImage`, activer le CORS :
```js
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Capture image failed to load"));
    image.src = src;
  });
}
```

- [ ] **Step 3:** `node --check src/overlay.js` ; **commit.**

---

## Task 5: build release + vérification GUI
- [ ] `npm run tauri build` ; lancer la `.app`. Tester :
  1. ⌘⇧2 sur grand écran → **pas de flash blanc / overlay rapide** (protocole OK).
  2. **Copy** puis coller, et **Save** → l'image sort bien (⚠️ si erreur « canvas taint »,
     vérifier l'en-tête CORS + `crossOrigin`).
  3. **OCR** fonctionne toujours.
  4. Si 2ᵉ écran : ⌘⇧2 avec la souris sur le 2ᵉ écran → overlay/capture sur **cet** écran.
     Sinon, au moins **non-régression** sur l'écran principal.
- [ ] Corriger au besoin (débogage méthodique) ; **commit.**

## Critère d'acceptation
Voir `docs/superpowers/specs/2026-05-31-palier4c-optimisations-design.md` §6.
