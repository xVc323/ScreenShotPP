// Le modèle de réglages pur (struct, défauts, lecture/écriture fichier) vit dans
// `screenshotpp-core` pour être testable sans la chaîne Tauri. Ici on garde la
// glu liée à Tauri (chemin de config, état partagé).
pub use screenshotpp_core::settings::{load_from_path, save_to_path, Settings};

/// Chemin du fichier de réglages dans le dossier de config de l'app.
pub fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

/// Charge les réglages de l'app (défauts si absent).
pub fn load(app: &tauri::AppHandle) -> Settings {
    match settings_path(app) {
        Ok(p) => load_from_path(&p),
        Err(_) => Settings::default(),
    }
}

/// Sauvegarde les réglages de l'app.
pub fn save(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    save_to_path(&path, settings)
}

/// Réglages courants partagés (chargés au démarrage).
#[derive(Default)]
pub struct SettingsState(pub std::sync::Mutex<Settings>);
