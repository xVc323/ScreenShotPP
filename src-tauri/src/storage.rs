use chrono::{Local, NaiveDateTime};
use image::{ImageFormat, RgbaImage};
use std::io::Cursor;

/// Format d'image supporté au Palier 1.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SaveFormat {
    Png,
    Jpeg,
}

impl SaveFormat {
    pub fn from_str(s: &str) -> SaveFormat {
        match s {
            "jpeg" | "jpg" => SaveFormat::Jpeg,
            _ => SaveFormat::Png,
        }
    }
    pub fn extension(&self) -> &'static str {
        match self {
            SaveFormat::Png => "png",
            SaveFormat::Jpeg => "jpg",
        }
    }
}

/// Nom de fichier par défaut : "Capture 2026-05-30 a 14.32.png".
pub fn default_filename(now: NaiveDateTime, format: SaveFormat) -> String {
    format!(
        "Capture {} a {}.{}",
        now.format("%Y-%m-%d"),
        now.format("%H.%M"),
        format.extension()
    )
}

/// Nom basé sur l'heure locale courante.
pub fn current_filename(format: SaveFormat) -> String {
    default_filename(Local::now().naive_local(), format)
}

/// Encode une image RGBA dans le format demandé et renvoie les octets.
pub fn encode_image(img: &RgbaImage, format: SaveFormat) -> Result<Vec<u8>, String> {
    let mut buf = Cursor::new(Vec::new());
    match format {
        SaveFormat::Png => img
            .write_to(&mut buf, ImageFormat::Png)
            .map_err(|e| e.to_string())?,
        SaveFormat::Jpeg => {
            // JPEG ne gère pas l'alpha : on convertit en RGB.
            let rgb = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
            rgb.write_to(&mut buf, ImageFormat::Jpeg)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(buf.into_inner())
}

/// Écrit les octets encodés sur le disque.
pub fn write_to_disk(path: &str, bytes: &[u8]) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn filename_is_formatted_with_date_and_extension() {
        let dt = NaiveDate::from_ymd_opt(2026, 5, 30)
            .unwrap()
            .and_hms_opt(14, 32, 0)
            .unwrap();
        assert_eq!(
            default_filename(dt, SaveFormat::Png),
            "Capture 2026-05-30 a 14.32.png"
        );
        assert_eq!(
            default_filename(dt, SaveFormat::Jpeg),
            "Capture 2026-05-30 a 14.32.jpg"
        );
    }

    #[test]
    fn png_encoding_starts_with_png_magic_bytes() {
        let img = RgbaImage::new(4, 4);
        let bytes = encode_image(&img, SaveFormat::Png).unwrap();
        assert_eq!(&bytes[0..4], &[0x89, 0x50, 0x4E, 0x47]); // .PNG
    }

    #[test]
    fn jpeg_encoding_starts_with_jpeg_magic_bytes() {
        let img = RgbaImage::new(4, 4);
        let bytes = encode_image(&img, SaveFormat::Jpeg).unwrap();
        assert_eq!(&bytes[0..2], &[0xFF, 0xD8]); // JPEG SOI
    }

    #[test]
    fn format_from_str_defaults_to_png() {
        assert_eq!(SaveFormat::from_str("webp"), SaveFormat::Png);
        assert_eq!(SaveFormat::from_str("jpg"), SaveFormat::Jpeg);
    }
}
