mod tray;
mod settings;
mod storage;
mod capture;
mod clipboard;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Pas d'icône dans le Dock macOS : politique "accessory".
            #[cfg(target_os = "macos")]
            let _ = app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
