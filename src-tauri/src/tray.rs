use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Manager,
};

/// Construit l'icône de tray/menu bar avec un menu minimal.
pub fn build_tray(app: &App) -> tauri::Result<()> {
    let settings_item = MenuItem::with_id(app, "settings", "Open settings", true, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop-recording", "Stop recording", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    // L'item stop n'apparaît qu'en enregistrement (menu reconstruit par set_recording).
    let menu = Menu::with_items(app, &[&settings_item, &quit])?;
    let _ = stop_item; // gabarit : l'item réel est créé dans set_recording

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "stop-recording" => {
                let app = app.clone();
                std::thread::spawn(move || {
                    if let Err(e) = crate::record::stop(&app) {
                        eprintln!("Arrêt d'enregistrement échoué: {e}");
                    }
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

/// Bascule l'apparence du tray : pastille rouge + item "Stop recording" pendant
/// l'enregistrement, icône/menu normaux sinon.
pub fn set_recording(app: &AppHandle, on: bool) {
    let Some(tray) = app.tray_by_id("main-tray") else { return };
    if on {
        let size = 32u32;
        let rgba = screenshotpp_core::record::recording_badge_rgba(size);
        let _ = tray.set_icon(Some(tauri::image::Image::new_owned(rgba, size, size)));
        if let (Ok(stop), Ok(quit)) = (
            MenuItem::with_id(app, "stop-recording", "Stop recording", true, None::<&str>),
            MenuItem::with_id(app, "quit", "Quit", true, None::<&str>),
        ) {
            if let Ok(menu) = Menu::with_items(app, &[&stop, &quit]) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    } else {
        if let Some(icon) = app.default_window_icon() {
            let _ = tray.set_icon(Some(icon.clone()));
        }
        if let (Ok(settings_item), Ok(quit)) = (
            MenuItem::with_id(app, "settings", "Open settings", true, None::<&str>),
            MenuItem::with_id(app, "quit", "Quit", true, None::<&str>),
        ) {
            if let Ok(menu) = Menu::with_items(app, &[&settings_item, &quit]) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    }
}
