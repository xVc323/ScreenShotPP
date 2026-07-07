use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    pub capture_shortcut: String,
    pub default_save_folder: String,
    pub default_format: String, // "png" | "jpeg"
    pub ocr_language: String,    // "auto" | code langue
    #[serde(default)]
    pub launch_at_login: bool, // lancer l'app à l'ouverture de session
    #[serde(default = "default_delayed_capture_shortcut")]
    pub delayed_capture_shortcut: String, // raccourci de capture différée
    #[serde(default = "default_capture_delay_secs")]
    pub capture_delay_secs: u32, // durée du compte à rebours, en secondes
    #[serde(default = "default_cancel_shortcut")]
    pub cancel_shortcut: String, // raccourci d'annulation pendant le décompte
    #[serde(default = "default_record_shortcut")]
    pub record_shortcut: String, // raccourci d'enregistrement vidéo
    #[serde(default = "default_record_cursor")]
    pub record_cursor: bool, // inclure le curseur dans la vidéo
    #[serde(default = "default_record_fps")]
    pub record_fps: u32, // images/seconde de l'enregistrement
}

fn default_delayed_capture_shortcut() -> String {
    "CmdOrCtrl+Shift+3".to_string()
}
fn default_capture_delay_secs() -> u32 {
    3
}
fn default_cancel_shortcut() -> String {
    "Escape".to_string()
}
fn default_record_shortcut() -> String {
    "CmdOrCtrl+Shift+5".to_string()
}
fn default_record_cursor() -> bool {
    true
}
fn default_record_fps() -> u32 {
    30
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            capture_shortcut: "CmdOrCtrl+Shift+2".to_string(),
            default_save_folder: String::new(), // résolu au runtime (Bureau)
            default_format: "png".to_string(),
            ocr_language: "auto".to_string(),
            launch_at_login: false,
            delayed_capture_shortcut: default_delayed_capture_shortcut(),
            capture_delay_secs: default_capture_delay_secs(),
            cancel_shortcut: default_cancel_shortcut(),
            record_shortcut: default_record_shortcut(),
            record_cursor: default_record_cursor(),
            record_fps: default_record_fps(),
        }
    }
}

/// Charge des réglages depuis un chemin (défauts si absent/invalide).
pub fn load_from_path(path: &std::path::Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Écrit les réglages en JSON (crée le dossier parent au besoin).
pub fn save_to_path(path: &std::path::Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_have_expected_values() {
        let s = Settings::default();
        assert_eq!(s.capture_shortcut, "CmdOrCtrl+Shift+2");
        assert_eq!(s.default_format, "png");
        assert_eq!(s.ocr_language, "auto");
    }

    #[test]
    fn settings_roundtrip_through_json() {
        let s = Settings::default();
        let json = serde_json::to_string(&s).unwrap();
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn save_then_load_round_trips_through_a_file() {
        let mut path = std::env::temp_dir();
        path.push(format!("sspp-settings-{}.json", std::process::id()));
        let mut s = Settings::default();
        s.capture_shortcut = "CmdOrCtrl+Shift+9".to_string();
        s.ocr_language = "fr-FR".to_string();
        save_to_path(&path, &s).unwrap();
        assert_eq!(load_from_path(&path), s);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn loading_missing_file_yields_defaults() {
        let path = std::path::Path::new("/tmp/sspp-does-not-exist-xyz123.json");
        assert_eq!(load_from_path(path), Settings::default());
    }

    #[test]
    fn default_settings_have_delayed_capture_values() {
        let s = Settings::default();
        assert_eq!(s.delayed_capture_shortcut, "CmdOrCtrl+Shift+3");
        assert_eq!(s.capture_delay_secs, 3);
        assert_eq!(s.cancel_shortcut, "Escape");
    }

    #[test]
    fn old_settings_json_without_delayed_fields_still_loads() {
        // JSON écrit par une version antérieure (sans les champs de capture différée).
        let json = r#"{
            "capture_shortcut": "CmdOrCtrl+Shift+2",
            "default_save_folder": "",
            "default_format": "png",
            "ocr_language": "auto",
            "launch_at_login": false
        }"#;
        let s: Settings = serde_json::from_str(json).unwrap();
        assert_eq!(s.delayed_capture_shortcut, "CmdOrCtrl+Shift+3");
        assert_eq!(s.capture_delay_secs, 3);
        assert_eq!(s.cancel_shortcut, "Escape");
    }

    #[test]
    fn default_settings_have_record_values() {
        let s = Settings::default();
        assert_eq!(s.record_shortcut, "CmdOrCtrl+Shift+5");
        assert!(s.record_cursor);
        assert_eq!(s.record_fps, 30);
    }

    #[test]
    fn old_settings_json_without_record_fields_still_loads() {
        let json = r#"{
            "capture_shortcut": "CmdOrCtrl+Shift+2",
            "default_save_folder": "",
            "default_format": "png",
            "ocr_language": "auto",
            "launch_at_login": false
        }"#;
        let s: Settings = serde_json::from_str(json).unwrap();
        assert_eq!(s.record_shortcut, "CmdOrCtrl+Shift+5");
        assert!(s.record_cursor);
        assert_eq!(s.record_fps, 30);
    }
}
