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
    let img = capture::capture_primary_monitor()?;
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
        .background_color(tauri::webview::Color(0, 0, 0, 255));

        // Épingle l'overlay au moniteur principal pour que l'image affichée et
        // la sélection partagent le même espace de coordonnées (le crop reste juste).
        // La sélection multi-moniteur complète est repoussée à un palier ultérieur.
        match app2.primary_monitor() {
            Ok(Some(monitor)) => {
                let pos = monitor.position();
                let size = monitor.size();
                let sf = monitor.scale_factor();
                builder = builder
                    .inner_size(size.width as f64 / sf, size.height as f64 / sf)
                    .position(pos.x as f64 / sf, pos.y as f64 / sf);
            }
            _ => {
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
    let png = storage::encode_png_fast(img)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(png);
    Ok(format!("data:image/png;base64,{b64}"))
}

/// Copie une image déjà composée (PNG base64) dans le presse-papier.
#[tauri::command]
pub fn copy_composited(app: AppHandle, png_base64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;
    let img = storage::decode_png_to_rgba(&bytes)?;
    clipboard::copy_image(&app, &img)?;
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
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;
    let img = storage::decode_png_to_rgba(&bytes)?;
    let fmt = storage::SaveFormat::from_str(&format);
    let out = storage::encode_image(&img, fmt)?;
    storage::write_to_disk(&path, &out)?;
    close_overlay(&app);
    Ok(())
}

/// Nom de fichier par défaut proposé à la fenêtre d'enregistrement.
#[tauri::command]
pub fn default_save_name(format: String) -> String {
    storage::current_filename(storage::SaveFormat::from_str(&format))
}

/// Ferme l'overlay (annulation depuis l'interface).
#[tauri::command]
pub fn cancel_capture(app: AppHandle) {
    close_overlay(&app);
}

fn close_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.close();
    }
}
