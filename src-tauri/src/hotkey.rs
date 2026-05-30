use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Enregistre le raccourci global ; à chaque appui (pressed), lance la capture.
pub fn register_capture_shortcut(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let acc = accelerator.to_string();
    app.global_shortcut()
        .on_shortcut(accelerator, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Err(e) = crate::commands::start_capture(app.clone()) {
                    eprintln!("Capture échouée: {e}");
                }
            }
        })
        .map_err(|e| format!("Échec d'enregistrement du raccourci {acc}: {e}"))
}

/// Désenregistre tout puis enregistre le raccourci de capture courant.
pub fn reregister(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    register_capture_shortcut(app, accelerator)
}
