use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    pub capture_shortcut: String,
    pub default_save_folder: String,
    pub default_format: String, // "png" | "jpeg"
    pub ocr_language: String,    // "auto" | code langue
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            capture_shortcut: "CmdOrCtrl+Shift+2".to_string(),
            default_save_folder: String::new(), // résolu au runtime (Bureau)
            default_format: "png".to_string(),
            ocr_language: "auto".to_string(),
        }
    }
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
}
