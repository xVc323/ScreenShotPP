use image::RgbaImage;
use tauri::image::Image;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Copie une image RGBA dans le presse-papier système.
pub fn copy_image(app: &tauri::AppHandle, img: &RgbaImage) -> Result<(), String> {
    let (w, h) = img.dimensions();
    let tauri_img = Image::new_owned(img.clone().into_raw(), w, h);
    app.clipboard()
        .write_image(&tauri_img)
        .map_err(|e| e.to_string())
}
