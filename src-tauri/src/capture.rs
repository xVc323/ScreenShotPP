use image::RgbaImage;

/// Rectangle de sélection en pixels physiques de l'image capturée.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Recadre l'image source selon le rectangle, en bornant aux dimensions de l'image.
pub fn crop_region(src: &RgbaImage, rect: Rect) -> RgbaImage {
    let max_w = src.width().saturating_sub(rect.x);
    let max_h = src.height().saturating_sub(rect.y);
    let w = rect.width.min(max_w).max(1);
    let h = rect.height.min(max_h).max(1);
    image::imageops::crop_imm(src, rect.x, rect.y, w, h).to_image()
}

/// Capture le moniteur principal et renvoie son image RGBA.
/// (Intégration OS — non testée en unitaire, vérifiée manuellement.)
pub fn capture_primary_monitor() -> Result<RgbaImage, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .ok_or_else(|| "Aucun moniteur principal trouvé".to_string())?;
    monitor.capture_image().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid_image(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_pixel(w, h, image::Rgba([10, 20, 30, 255]))
    }

    #[test]
    fn crop_returns_requested_dimensions_when_in_bounds() {
        let src = solid_image(100, 100);
        let out = crop_region(&src, Rect { x: 10, y: 20, width: 30, height: 40 });
        assert_eq!(out.dimensions(), (30, 40));
    }

    #[test]
    fn crop_is_clamped_to_image_bounds() {
        let src = solid_image(100, 100);
        let out = crop_region(&src, Rect { x: 90, y: 90, width: 50, height: 50 });
        assert_eq!(out.dimensions(), (10, 10));
    }

    #[test]
    fn crop_never_returns_zero_sized_image() {
        let src = solid_image(100, 100);
        let out = crop_region(&src, Rect { x: 10, y: 10, width: 0, height: 0 });
        assert_eq!(out.dimensions(), (1, 1));
    }
}
