mod capture;
#[cfg(windows)]
mod capture_win;
mod clipboard;
mod commands;
mod hotkey;
mod ocr;
mod settings;
mod storage;
mod tray;
mod window_pick;

use commands::CaptureState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .register_uri_scheme_protocol("capture", |ctx, _request| {
            let app = ctx.app_handle();
            let state = app.state::<CaptureState>();
            let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
            match guard.as_ref() {
                Some(session) => {
                    let encoded = storage::encode_bmp_fast(&session.image);
                    match encoded {
                        Ok(bmp) => tauri::http::Response::builder()
                            .header("Content-Type", "image/bmp")
                            .header("Access-Control-Allow-Origin", "*")
                            .header("Cache-Control", "no-store")
                            .body(bmp)
                            .unwrap(),
                        Err(_) => tauri::http::Response::builder()
                            .status(500)
                            .body(Vec::new())
                            .unwrap(),
                    }
                }
                None => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap(),
            }
        })
        .manage(CaptureState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_capture_data_url,
            commands::get_capture_metadata,
            commands::copy_composited,
            commands::save_composited,
            commands::default_save_name,
            commands::cancel_capture,
            commands::ocr_region,
            commands::copy_text,
            commands::get_settings,
            commands::update_settings,
            commands::default_save_path,
            commands::app_version,
            commands::show_overlay,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            let _ = app
                .handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::build_tray(app)?;

            let settings = settings::load(app.handle());
            hotkey::register_capture_shortcut(app.handle(), &settings.capture_shortcut)?;
            hotkey::register_delayed_capture_shortcut(
                app.handle(),
                &settings.delayed_capture_shortcut,
            )?;
            {
                use tauri_plugin_autostart::ManagerExt;
                let autolaunch = app.autolaunch();
                let _ = if settings.launch_at_login {
                    autolaunch.enable()
                } else {
                    autolaunch.disable()
                };
            }
            app.manage(settings::SettingsState(std::sync::Mutex::new(settings)));

            if let Some(main) = app.get_webview_window("main") {
                let hidden = main.clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = hidden.hide();
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
