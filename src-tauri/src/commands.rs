use crate::capture;
use crate::{clipboard, storage};
use base64::Engine;
use image::RgbaImage;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Capture courante gelée, partagée entre commands.
#[derive(Default)]
pub struct CaptureState(pub Mutex<Option<RgbaImage>>);

/// Déclenché par le raccourci : capture l'écran, stocke l'image, ouvre l'overlay.
/// La création de la fenêtre est faite sur le thread principal (exigence macOS).
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
        let mut builder = WebviewWindowBuilder::new(
            &app2,
            "overlay",
            WebviewUrl::App("overlay.html".into()),
        )
        .title("ScreenShotPP Overlay")
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .focused(true)
        .resizable(false)
        .visible(false)
        .background_color(tauri::webview::Color(0, 0, 0, 255));

        // Épingle l'overlay au moniteur Tauri sous le curseur (même écran que la capture),
        // pour que l'image affichée et la sélection partagent le même espace de coordonnées.
        let monitors = app2.available_monitors().unwrap_or_default();
        let rects: Vec<capture::MonitorRect> = monitors
            .iter()
            .map(|m| {
                let p = m.position();
                let s = m.size();
                capture::MonitorRect { x: p.x, y: p.y, width: s.width, height: s.height }
            })
            .collect();
        let target_index =
            capture::monitor_at(&rects, cx, cy).or(if monitors.is_empty() { None } else { Some(0) });
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

/// L'overlay récupère la capture gelée en PNG (data URL base64) pour l'afficher.
#[tauri::command]
pub fn get_capture_data_url(app: AppHandle) -> Result<String, String> {
    let state = app.state::<CaptureState>();
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let img = guard.as_ref().ok_or("Aucune capture en cours")?;
    let png = storage::encode_image(img, storage::SaveFormat::Png)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(png);
    Ok(format!("data:image/png;base64,{b64}"))
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
            let img = guard.as_ref().ok_or("Aucune capture en cours")?;
            capture::crop_region(img, rect)
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
    crate::hotkey::reregister(&app, &new_settings.capture_shortcut)?;
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
