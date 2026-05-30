mod tray;
mod settings;
mod storage;
mod capture;
mod clipboard;
mod hotkey;
mod commands;
mod ocr;

use commands::CaptureState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(CaptureState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_capture_data_url,
            commands::copy_composited,
            commands::save_composited,
            commands::default_save_name,
            commands::cancel_capture,
            commands::ocr_region,
            commands::copy_text,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            let _ = app
                .handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::build_tray(app)?;

            let settings = settings::Settings::default();
            hotkey::register_capture_shortcut(app.handle(), &settings.capture_shortcut)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
