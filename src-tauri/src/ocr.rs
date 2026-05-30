use image::RgbaImage;

#[cfg(target_os = "macos")]
mod mac {
    use swift_rs::{swift, SRData, SRString};
    swift!(pub(crate) fn ocr_recognize(data: SRData) -> SRString);
}

/// Reconnaît le texte d'une image. macOS : Apple Vision. Ailleurs : pas encore disponible.
#[cfg(target_os = "macos")]
pub fn recognize(img: &RgbaImage) -> Result<String, String> {
    use swift_rs::SRData;
    let png = crate::storage::encode_image(img, crate::storage::SaveFormat::Png)?;
    let data = SRData::from(png.as_slice());
    let result = unsafe { mac::ocr_recognize(data) };
    Ok(result.to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn recognize(_img: &RgbaImage) -> Result<String, String> {
    Err("OCR pas encore disponible sur cette plateforme".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[test]
    fn blank_image_has_no_recognized_text() {
        let img = RgbaImage::new(16, 16);

        assert_eq!(recognize(&img).unwrap(), "");
    }
}
