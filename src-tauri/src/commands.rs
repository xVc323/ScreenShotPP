use crate::capture::{self, Rect};
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
        *state.0.lock().unwrap() = Some(img);
    }
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window("overlay") {
            let _ = w.close();
        }
        let res = WebviewWindowBuilder::new(
            &app2,
            "overlay",
            WebviewUrl::App("overlay.html".into()),
        )
        .title("ScreenShotPP Overlay")
        .fullscreen(true)
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .focused(true)
        .build();
        if let Err(e) = res {
            eprintln!("Création de l'overlay échouée: {e}");
        }
    })
    .map_err(|e| e.to_string())
}

/// L'overlay récupère la capture gelée en PNG (data URL base64) pour l'afficher.
#[tauri::command]
pub fn get_capture_data_url(app: AppHandle) -> Result<String, String> {
    let state = app.state::<CaptureState>();
    let guard = state.0.lock().unwrap();
    let img = guard.as_ref().ok_or("Aucune capture en cours")?;
    let png = storage::encode_image(img, storage::SaveFormat::Png)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(png);
    Ok(format!("data:image/png;base64,{b64}"))
}

/// Recadre selon le rectangle (pixels physiques) et copie dans le presse-papier.
#[tauri::command]
pub fn copy_selection(app: AppHandle, rect: Rect) -> Result<(), String> {
    let cropped = with_cropped(&app, rect)?;
    clipboard::copy_image(&app, &cropped)?;
    close_overlay(&app);
    Ok(())
}

/// Recadre et écrit sur disque au chemin/format donnés.
#[tauri::command]
pub fn save_selection(
    app: AppHandle,
    rect: Rect,
    path: String,
    format: String,
) -> Result<(), String> {
    let cropped = with_cropped(&app, rect)?;
    let fmt = storage::SaveFormat::from_str(&format);
    let bytes = storage::encode_image(&cropped, fmt)?;
    storage::write_to_disk(&path, &bytes)?;
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

fn with_cropped(app: &AppHandle, rect: Rect) -> Result<RgbaImage, String> {
    let state = app.state::<CaptureState>();
    let guard = state.0.lock().unwrap();
    let img = guard.as_ref().ok_or("Aucune capture en cours")?;
    Ok(capture::crop_region(img, rect))
}

fn close_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.close();
    }
}
