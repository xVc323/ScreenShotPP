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

/// Enregistre le raccourci de capture différée ; à l'appui, lance le décompte.
pub fn register_delayed_capture_shortcut(
    app: &AppHandle,
    accelerator: &str,
) -> Result<(), String> {
    let acc = accelerator.to_string();
    app.global_shortcut()
        .on_shortcut(accelerator, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                // `start_delayed_capture` enregistre le raccourci d'annulation via le
                // plugin global-shortcut. L'appeler ici, SYNCHRONE dans le callback du
                // plugin, ré-entre le verrou interne du plugin → deadlock du thread
                // principal (l'app gèle, Windows). On déporte donc tout le travail sur
                // un thread dédié pour que le callback rende la main immédiatement.
                let app = app.clone();
                std::thread::spawn(move || {
                    if let Err(e) = crate::commands::start_delayed_capture(app) {
                        eprintln!("Capture différée échouée: {e}");
                    }
                });
            }
        })
        .map_err(|e| format!("Échec d'enregistrement du raccourci différé {acc}: {e}"))
}

/// Désenregistre tout puis réenregistre les raccourcis instantané et différé.
pub fn reregister_all(
    app: &AppHandle,
    capture_shortcut: &str,
    delayed_shortcut: &str,
) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    register_capture_shortcut(app, capture_shortcut)?;
    register_delayed_capture_shortcut(app, delayed_shortcut)
}
