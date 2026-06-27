use image::RgbaImage;

/// Rectangle de sélection en pixels physiques de l'image capturée.
// Conservé pour le prochain palier de sélection de zone.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, serde::Deserialize, serde::Serialize)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Recadre l'image source selon le rectangle, en bornant aux dimensions de l'image.
// Conservé pour le prochain palier de sélection de zone.
#[allow(dead_code)]
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

/// Rectangle d'un moniteur en pixels physiques globaux.
#[derive(Debug, Clone, Copy)]
pub struct MonitorRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Index du premier moniteur contenant le point (x, y), ou None.
pub fn monitor_at(rects: &[MonitorRect], x: i32, y: i32) -> Option<usize> {
    rects
        .iter()
        .position(|m| x >= m.x && x < m.x + m.width as i32 && y >= m.y && y < m.y + m.height as i32)
}

/// Rectangle du moniteur contenant (x, y), ou du moniteur principal en repli,
/// accompagné de son facteur d'échelle (pixels physiques / points logiques).
/// Sur macOS, le rectangle est en points logiques (xcap = `CGDisplayBounds`) ;
/// le scale permet de reconvertir une sélection en pixels physiques de l'image.
pub fn monitor_rect_at(x: i32, y: i32) -> Result<(MonitorRect, f32), String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let rects: Vec<MonitorRect> = monitors
        .iter()
        .map(|m| MonitorRect {
            x: m.x().unwrap_or(0),
            y: m.y().unwrap_or(0),
            width: m.width().unwrap_or(0),
            height: m.height().unwrap_or(0),
        })
        .collect();
    let idx = monitor_at(&rects, x, y).unwrap_or_else(|| {
        monitors
            .iter()
            .position(|m| m.is_primary().unwrap_or(false))
            .unwrap_or(0)
    });
    let rect = rects.get(idx).copied().ok_or("Aucun moniteur".to_string())?;
    let scale = monitors
        .get(idx)
        .and_then(|m| m.scale_factor().ok())
        .unwrap_or(1.0);
    Ok((rect, scale))
}

/// Capture le moniteur contenant (x, y), ou le moniteur principal en repli.
/// Sur Windows : via Windows Graphics Capture (WGC), fiable pour le contenu
/// composé GPU (partage Teams) et les écrans secondaires / DPI mixtes.
#[cfg(windows)]
pub fn capture_at(x: i32, y: i32) -> Result<RgbaImage, String> {
    crate::capture_win::capture_at_point(x, y)
}

/// Capture le moniteur contenant (x, y), ou le moniteur principal en repli.
#[cfg(not(windows))]
pub fn capture_at(x: i32, y: i32) -> Result<RgbaImage, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let rects: Vec<MonitorRect> = monitors
        .iter()
        .map(|m| MonitorRect {
            x: m.x().unwrap_or(0),
            y: m.y().unwrap_or(0),
            width: m.width().unwrap_or(0),
            height: m.height().unwrap_or(0),
        })
        .collect();
    let idx = monitor_at(&rects, x, y).unwrap_or_else(|| {
        monitors
            .iter()
            .position(|m| m.is_primary().unwrap_or(false))
            .unwrap_or(0)
    });
    monitors
        .get(idx)
        .ok_or("Aucun moniteur")?
        .capture_image()
        .map_err(|e| e.to_string())
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
        let out = crop_region(
            &src,
            Rect {
                x: 10,
                y: 20,
                width: 30,
                height: 40,
            },
        );
        assert_eq!(out.dimensions(), (30, 40));
    }

    #[test]
    fn crop_is_clamped_to_image_bounds() {
        let src = solid_image(100, 100);
        let out = crop_region(
            &src,
            Rect {
                x: 90,
                y: 90,
                width: 50,
                height: 50,
            },
        );
        assert_eq!(out.dimensions(), (10, 10));
    }

    #[test]
    fn crop_never_returns_zero_sized_image() {
        let src = solid_image(100, 100);
        let out = crop_region(
            &src,
            Rect {
                x: 10,
                y: 10,
                width: 0,
                height: 0,
            },
        );
        assert_eq!(out.dimensions(), (1, 1));
    }

    #[test]
    fn crop_extracts_the_correct_pixels() {
        // Image 4x4 : colonne gauche rouge, reste noir.
        let mut src = RgbaImage::from_pixel(4, 4, image::Rgba([0, 0, 0, 255]));
        for y in 0..4 {
            src.put_pixel(0, y, image::Rgba([255, 0, 0, 255]));
        }
        // Recadre une zone 2x2 à partir de (1,1) : doit être entièrement noire.
        let out = crop_region(
            &src,
            Rect {
                x: 1,
                y: 1,
                width: 2,
                height: 2,
            },
        );
        assert_eq!(out.dimensions(), (2, 2));
        assert_eq!(*out.get_pixel(0, 0), image::Rgba([0, 0, 0, 255]));
        // Recadre incluant la colonne gauche : pixel (0,0) doit être rouge.
        let out2 = crop_region(
            &src,
            Rect {
                x: 0,
                y: 0,
                width: 2,
                height: 2,
            },
        );
        assert_eq!(*out2.get_pixel(0, 0), image::Rgba([255, 0, 0, 255]));
    }

    #[test]
    fn monitor_at_finds_the_monitor_containing_the_point() {
        let rects = [
            MonitorRect {
                x: 0,
                y: 0,
                width: 1000,
                height: 1000,
            },
            MonitorRect {
                x: 1000,
                y: 0,
                width: 800,
                height: 600,
            },
        ];
        assert_eq!(monitor_at(&rects, 500, 500), Some(0));
        assert_eq!(monitor_at(&rects, 1200, 100), Some(1));
        assert_eq!(monitor_at(&rects, 5000, 5000), None);
        assert_eq!(monitor_at(&rects, 1000, 0), Some(1)); // bord gauche du 2e écran
    }
}
