use crate::capture;
use crate::window_pick;
use crate::{clipboard, storage};
use base64::Engine;
use image::RgbaImage;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// Empêche deux captures différées simultanées (double appui du raccourci).
static DELAYED_RUNNING: AtomicBool = AtomicBool::new(false);

/// Capture courante gelée, partagée entre commands.
#[derive(Default)]
pub struct CaptureState(pub Mutex<Option<CaptureSession>>);

pub struct WindowCapture {
    pub image: RgbaImage,
    pub rect: capture::Rect,
}

pub struct CaptureSession {
    pub image: RgbaImage,
    pub window_selections: Vec<WindowSelection>,
    pub window_capture: Option<WindowCapture>,
}

#[derive(serde::Serialize)]
pub struct WindowCaptureMeta {
    pub width: u32,
    pub height: u32,
}

#[derive(serde::Serialize)]
pub struct CaptureMetadata {
    pub image_width: u32,
    pub image_height: u32,
    pub window_selections: Vec<WindowSelection>,
    pub window_capture: Option<WindowCaptureMeta>,
}

#[derive(Clone, serde::Serialize)]
pub struct WindowSelection {
    pub selection: capture::Rect,
    pub activation: capture::Rect,
}

/// Déclenché par le raccourci instantané : capture immédiate puis overlay.
pub fn start_capture(app: AppHandle) -> Result<(), String> {
    begin_capture(app)
}

/// Corps partagé : lit le curseur, capture l'écran, stocke l'image, ouvre l'overlay.
/// La création de la fenêtre est faite sur le thread principal (exigence macOS).
fn begin_capture(app: AppHandle) -> Result<(), String> {
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    let (cx, cy) = (cursor.x as i32, cursor.y as i32);
    let (monitor_rect, monitor_scale) = capture::monitor_rect_at(cx, cy)?;
    let monitor_global_rect = window_pick::GlobalRect {
        x: monitor_rect.x,
        y: monitor_rect.y,
        width: monitor_rect.width,
        height: monitor_rect.height,
    };
    let candidate = window_pick::foreground_window_selection(monitor_global_rect, monitor_scale as f64);
    // La fenêtre déborde si son rect GLOBAL non-rogné sort du moniteur. On NE compare
    // PAS le rect relatif : il est par construction borné au moniteur et ne déborde
    // jamais. `global_rect` et `monitor_global_rect` sont dans le même espace de
    // coordonnées (pixels physiques sur Windows, points logiques sur macOS).
    let window_overflows = candidate
        .map(|c| {
            screenshotpp_core::geometry::overflows(
                capture::MonitorRect {
                    x: c.global_rect.x,
                    y: c.global_rect.y,
                    width: c.global_rect.width,
                    height: c.global_rect.height,
                },
                capture::MonitorRect {
                    x: monitor_global_rect.x,
                    y: monitor_global_rect.y,
                    width: monitor_global_rect.width,
                    height: monitor_global_rect.height,
                },
            )
        })
        .unwrap_or(false);
    let window_selections = candidate
        .into_iter()
        .map(|candidate| WindowSelection {
            selection: rect_from_global(candidate.monitor_relative_rect),
            activation: rect_from_global(candidate.monitor_relative_activation_rect),
        })
        .collect();
    let img = capture::capture_at(cx, cy)?;
    // Si la fenêtre au premier plan déborde du moniteur, on capture son bitmap
    // complet (partie hors-écran incluse) pour un rendu "fenêtre entière".
    let window_capture = if window_overflows {
        capture::capture_foreground_window()
            .ok()
            .flatten()
            .map(|(image, rect)| WindowCapture { image, rect })
    } else {
        None
    };
    {
        let state = app.state::<CaptureState>();
        *state.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(CaptureSession {
            image: img,
            window_selections,
            window_capture,
        });
    }
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window("overlay") {
            let _ = w.close();
        }
        let mut builder =
            WebviewWindowBuilder::new(&app2, "overlay", WebviewUrl::App("overlay.html".into()))
                .title("ScreenShotPP Overlay")
                .always_on_top(true)
                .decorations(false)
                .skip_taskbar(true)
                .focused(true)
                .resizable(false)
                .visible(false)
                .transparent(true);

        // Épingle l'overlay au moniteur Tauri sous le curseur (même écran que la capture),
        // pour que l'image affichée et la sélection partagent le même espace de coordonnées.
        let monitors = app2.available_monitors().unwrap_or_default();
        let rects: Vec<capture::MonitorRect> = monitors
            .iter()
            .map(|m| {
                let p = m.position();
                let s = m.size();
                capture::MonitorRect {
                    x: p.x,
                    y: p.y,
                    width: s.width,
                    height: s.height,
                }
            })
            .collect();
        let target_index = capture::monitor_at(&rects, cx, cy).or(if monitors.is_empty() {
            None
        } else {
            Some(0)
        });
        match target_index.and_then(|i| monitors.get(i)) {
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

/// Déclenché par le raccourci de capture différée : affiche un compte à rebours
/// qui suit le curseur, annulable, puis lance la capture quand il atteint 0.
pub fn start_delayed_capture(app: AppHandle) -> Result<(), String> {
    let (total_secs, cancel_shortcut) = {
        let state = app.state::<crate::settings::SettingsState>();
        let s = state.0.lock().unwrap_or_else(|e| e.into_inner());
        (s.capture_delay_secs.max(1), s.cancel_shortcut.clone())
    };

    // Moniteur Tauri sous le curseur. Ses position/taille sont en pixels physiques
    // sur toutes les plateformes, comme `cursor_position()` — on reste donc dans un
    // seul espace de coordonnées (évite le décalage Retina de `monitor_rect_at`).
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    let (cx, cy) = (cursor.x as i32, cursor.y as i32);
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("Aucun moniteur disponible".to_string());
    }
    let idx = monitors
        .iter()
        .position(|m| {
            let p = m.position();
            let s = m.size();
            cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
        })
        .unwrap_or(0);
    let target = &monitors[idx];
    let mp = target.position();
    let ms = target.size();
    let monitor_rect = crate::capture::MonitorRect {
        x: mp.x,
        y: mp.y,
        width: ms.width,
        height: ms.height,
    };
    let win_px = (64.0 * target.scale_factor()).round() as u32;

    // Empêche deux décomptes simultanés (réinitialisé en fin de thread / sur erreur).
    if DELAYED_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    // Crée la fenêtre du compteur sur le thread principal.
    let app_main = app.clone();
    let main_thread_result = app.run_on_main_thread(move || {
        if let Some(w) = app_main.get_webview_window("countdown") {
            let _ = w.close();
        }
        let builder = WebviewWindowBuilder::new(
            &app_main,
            "countdown",
            WebviewUrl::App("countdown.html".into()),
        )
        .title("Countdown")
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .resizable(false)
        .visible(false)
        .transparent(true)
        .shadow(false)
        .inner_size(64.0, 64.0);
        match builder.build() {
            Ok(w) => {
                let _ = w.set_ignore_cursor_events(true);
            }
            Err(e) => eprintln!("Création du compteur échouée: {e}"),
        }
    });
    if let Err(e) = main_thread_result {
        DELAYED_RUNNING.store(false, Ordering::SeqCst);
        return Err(e.to_string());
    }

    // Drapeau d'annulation + enregistrement du raccourci d'annulation temporaire.
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let flag = cancelled.clone();
        if let Err(e) = app.global_shortcut().on_shortcut(
            cancel_shortcut.as_str(),
            move |_app, _sc, event| {
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    flag.store(true, Ordering::SeqCst);
                }
            },
        ) {
            DELAYED_RUNNING.store(false, Ordering::SeqCst);
            let app_cleanup = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(w) = app_cleanup.get_webview_window("countdown") {
                    let _ = w.close();
                }
            });
            return Err(format!("Échec d'enregistrement du raccourci d'annulation: {e}"));
        }
    }

    // Boucle de décompte sur un thread dédié (ne bloque pas le thread principal).
    let app_loop = app.clone();
    let cancel_sc = cancel_shortcut.clone();
    std::thread::spawn(move || {
        let start = Instant::now();
        let mut shown = false;
        loop {
            let elapsed = start.elapsed().as_millis();
            if cancelled.load(Ordering::SeqCst) {
                break;
            }
            let remaining = screenshotpp_core::countdown::remaining_seconds(total_secs, elapsed);
            if remaining == 0 {
                break;
            }
            // Position de la fenêtre sous le curseur + chiffre courant.
            if let Ok(pos) = app_loop.cursor_position() {
                let (px, py) = screenshotpp_core::countdown::window_origin(
                    (pos.x as i32, pos.y as i32),
                    (win_px, win_px),
                    monitor_rect,
                );
                let app_pos = app_loop.clone();
                let do_show = !shown;
                shown = true;
                let _ = app_loop.run_on_main_thread(move || {
                    if let Some(w) = app_pos.get_webview_window("countdown") {
                        let _ = w.set_position(tauri::PhysicalPosition::new(px, py));
                        if do_show {
                            let _ = w.show();
                        }
                    }
                });
            }
            let _ = app_loop.emit_to("countdown", "countdown-tick", remaining);
            std::thread::sleep(Duration::from_millis(33));
        }

        let was_cancelled = cancelled.load(Ordering::SeqCst);

        // Ferme le compteur AVANT de capturer (il ne doit pas apparaître).
        let app_close = app_loop.clone();
        let _ = app_loop.run_on_main_thread(move || {
            if let Some(w) = app_close.get_webview_window("countdown") {
                let _ = w.close();
            }
        });
        // Libère le raccourci d'annulation dans tous les cas.
        let _ = app_loop.global_shortcut().unregister(cancel_sc.as_str());

        if !was_cancelled {
            // Petit répit pour laisser le compositor retirer la fenêtre du compteur.
            std::thread::sleep(Duration::from_millis(60));
            if let Err(e) = begin_capture(app_loop.clone()) {
                eprintln!("Capture différée échouée: {e}");
            }
        }
        DELAYED_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(())
}

/// L'overlay récupère la capture gelée en PNG (data URL base64) pour l'afficher.
#[tauri::command]
pub fn get_capture_data_url(app: AppHandle) -> Result<String, String> {
    let state = app.state::<CaptureState>();
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let session = guard.as_ref().ok_or("Aucune capture en cours")?;
    let png = storage::encode_image(&session.image, storage::SaveFormat::Png)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(png);
    Ok(format!("data:image/png;base64,{b64}"))
}

#[tauri::command]
pub fn get_capture_metadata(app: AppHandle) -> Result<CaptureMetadata, String> {
    let state = app.state::<CaptureState>();
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let session = guard.as_ref().ok_or("Aucune capture en cours")?;
    Ok(CaptureMetadata {
        image_width: session.image.width(),
        image_height: session.image.height(),
        window_selections: session.window_selections.clone(),
        window_capture: session.window_capture.as_ref().map(|w| WindowCaptureMeta {
            width: w.image.width(),
            height: w.image.height(),
        }),
    })
}

fn rect_from_global(rect: window_pick::GlobalRect) -> capture::Rect {
    capture::Rect {
        x: rect.x.max(0) as u32,
        y: rect.y.max(0) as u32,
        width: rect.width,
        height: rect.height,
    }
}

/// Copie une image déjà composée (PNG base64) dans le presse-papier.
#[tauri::command]
pub fn copy_composited(app: AppHandle, png_base64: String, target: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;
    let img = storage::decode_png_to_rgba(&bytes)?;
    match storage::target_max_bytes(&target) {
        Some(n) => {
            let reduced = storage::fit_by_downscale(&img, n)?;
            clipboard::copy_image(&app, &reduced)?;
        }
        None => clipboard::copy_image(&app, &img)?,
    }
    close_overlay(&app);
    Ok(())
}

/// Enregistre une image déjà composée (PNG base64) au format/chemin choisis.
#[tauri::command]
pub fn save_composited(
    app: AppHandle,
    png_base64: String,
    path: String,
    format: String,
    target: String,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;
    let img = storage::decode_png_to_rgba(&bytes)?;
    let out = match storage::target_max_bytes(&target) {
        Some(n) => storage::fit_by_jpeg_quality(&img, n)?,
        None => {
            let fmt = storage::SaveFormat::from_str(&format);
            storage::encode_image(&img, fmt)?
        }
    };
    storage::write_to_disk(&path, &out)?;
    close_overlay(&app);
    Ok(())
}

/// Nom de fichier par défaut proposé à la fenêtre d'enregistrement.
#[tauri::command]
pub fn default_save_name(format: String) -> String {
    storage::current_filename(storage::SaveFormat::from_str(&format))
}

#[tauri::command]
pub async fn ocr_region(app: AppHandle, rect: capture::Rect) -> Result<String, String> {
    let lang = app
        .state::<crate::settings::SettingsState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .ocr_language
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CaptureState>();
        let cropped = {
            let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
            let session = guard.as_ref().ok_or("Aucune capture en cours")?;
            capture::crop_region(&session.image, rect)
        };
        crate::ocr::recognize(&cropped, &lang)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> crate::settings::Settings {
    app.state::<crate::settings::SettingsState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    new_settings: crate::settings::Settings,
) -> Result<(), String> {
    crate::hotkey::reregister_all(
        &app,
        &new_settings.capture_shortcut,
        &new_settings.delayed_capture_shortcut,
    )?;
    {
        use tauri_plugin_autostart::ManagerExt;
        let autolaunch = app.autolaunch();
        let result = if new_settings.launch_at_login {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        result.map_err(|e| e.to_string())?;
    }
    crate::settings::save(&app, &new_settings)?;
    *app.state::<crate::settings::SettingsState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = new_settings;
    Ok(())
}

#[tauri::command]
pub fn default_save_path(app: AppHandle, format: String) -> String {
    let folder = app
        .state::<crate::settings::SettingsState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .default_save_folder
        .clone();
    let name = storage::current_filename(storage::SaveFormat::from_str(&format));
    let dir = if folder.is_empty() {
        app.path().desktop_dir().ok()
    } else {
        Some(std::path::PathBuf::from(folder))
    };
    match dir {
        Some(d) => d.join(name).to_string_lossy().to_string(),
        None => name,
    }
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Ferme l'overlay (annulation depuis l'interface).
#[tauri::command]
pub fn cancel_capture(app: AppHandle) {
    close_overlay(&app);
}

/// Affiche l'overlay (appelé par le frontend une fois la capture peinte) → pas de flash noir.
#[tauri::command]
pub fn show_overlay(app: AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn close_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.close();
    }
}
