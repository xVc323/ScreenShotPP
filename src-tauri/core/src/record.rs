//! Logique pure de l'enregistrement vidéo : construction des arguments ffmpeg
//! (capture par OS, export trim/crop/vitesse, GIF), machine à états du
//! raccourci, parseurs de sortie ffmpeg, et pastille "REC" du tray.
//! Aucun I/O ici — le côté Tauri ne fait que spawner ffmpeg avec ces args.

/// Rectangle en pixels, relatif à la sortie capturée (moniteur ou frame vidéo).
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Region {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy)]
pub struct RecordOptions {
    pub fps: u32,
    pub cursor: bool,
}

/// H.264/yuv420p exige des dimensions paires : arrondit vers le bas, minimum 2.
pub fn even_dim(v: u32) -> u32 {
    (v & !1).max(2)
}

/// Réglages d'encodage communs (enregistrement et export MP4).
fn h264_encode_args() -> Vec<String> {
    ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// Args ffmpeg pour capturer une région d'un moniteur Windows via ddagrab
/// (Desktop Duplication — même API que WGC, pas de fenêtres noires GPU).
/// `output_idx` est l'index DXGI de la sortie ; offsets relatifs à cette sortie.
pub fn windows_capture_args(
    output_idx: u32,
    region: Region,
    opts: &RecordOptions,
    out_path: &str,
) -> Vec<String> {
    let (w, h) = (even_dim(region.width), even_dim(region.height));
    let filter = format!(
        "ddagrab=output_idx={}:framerate={}:offset_x={}:offset_y={}:video_size={}x{}:draw_mouse={},hwdownload,format=bgra",
        output_idx, opts.fps, region.x, region.y, w, h, if opts.cursor { 1 } else { 0 }
    );
    let mut args: Vec<String> = vec![
        "-y".into(),
        "-init_hw_device".into(),
        "d3d11va".into(),
        "-filter_complex".into(),
        filter,
    ];
    args.extend(h264_encode_args());
    // MP4 fragmenté : lisible même si le process meurt en cours d'enregistrement.
    args.extend(["-movflags".into(), "+frag_keyframe+empty_moov".into()]);
    args.push(out_path.into());
    args
}

/// Args ffmpeg pour capturer un écran macOS via avfoundation puis recadrer la
/// région (avfoundation capture l'écran entier, en pixels physiques/Retina).
/// `device_idx` est l'index du périphérique "Capture screen N" d'avfoundation.
pub fn macos_capture_args(
    device_idx: u32,
    region: Region,
    opts: &RecordOptions,
    out_path: &str,
) -> Vec<String> {
    let (w, h) = (even_dim(region.width), even_dim(region.height));
    let mut args: Vec<String> = vec![
        "-y".into(),
        "-f".into(),
        "avfoundation".into(),
        "-capture_cursor".into(),
        if opts.cursor { "1" } else { "0" }.into(),
        "-framerate".into(),
        opts.fps.to_string(),
        "-i".into(),
        format!("{device_idx}:none"),
        "-vf".into(),
        format!("crop={}:{}:{}:{}", w, h, region.x, region.y),
    ];
    args.extend(h264_encode_args());
    args.extend(["-movflags".into(), "+frag_keyframe+empty_moov".into()]);
    args.push(out_path.into());
    args
}

#[derive(Debug, Clone)]
pub struct ExportOptions {
    pub trim_start: f64,
    pub trim_end: f64,
    pub crop: Option<Region>,
    pub speed: f64, // 1.0, 2.0, 4.0
    pub gif: bool,
}

/// Fréquence fixe des GIFs exportés.
const GIF_FPS: u32 = 15;

/// Chaîne de filtres commune (crop puis vitesse), vide si aucun des deux.
fn filter_prefix(opts: &ExportOptions) -> Vec<String> {
    let mut parts = Vec::new();
    if let Some(c) = opts.crop {
        parts.push(format!(
            "crop={}:{}:{}:{}",
            even_dim(c.width),
            even_dim(c.height),
            c.x,
            c.y
        ));
    }
    if opts.speed != 1.0 {
        parts.push(format!("setpts=PTS/{}", opts.speed));
    }
    parts
}

/// Args ffmpeg pour l'export du mini-éditeur : trim (-ss/-to), crop, vitesse,
/// sortie MP4 (+faststart) ou GIF (palette deux passes en un seul appel).
pub fn export_args(input: &str, opts: &ExportOptions, output: &str) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-y".into(),
        "-ss".into(),
        opts.trim_start.to_string(),
        "-to".into(),
        opts.trim_end.to_string(),
        "-i".into(),
        input.into(),
    ];
    let prefix = filter_prefix(opts);
    if opts.gif {
        let mut chain = prefix;
        chain.push(format!("fps={GIF_FPS}"));
        let filter = format!(
            "{},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer",
            chain.join(",")
        );
        args.extend(["-filter_complex".into(), filter]);
    } else {
        if !prefix.is_empty() {
            args.extend(["-vf".into(), prefix.join(",")]);
        }
        args.extend(h264_encode_args());
        args.extend(["-movflags".into(), "+faststart".into()]);
    }
    args.push(output.into());
    args
}

/// Décision du raccourci d'enregistrement selon l'état courant.
/// `busy` = sélection ou export déjà en cours (on ignore le déclenchement) ;
/// un enregistrement actif peut TOUJOURS être arrêté.
#[derive(Debug)]
pub enum ShortcutAction {
    StartSelection,
    Stop,
    Ignore,
}

pub fn on_record_shortcut(recording: bool, busy: bool) -> ShortcutAction {
    if recording {
        ShortcutAction::Stop
    } else if busy {
        ShortcutAction::Ignore
    } else {
        ShortcutAction::StartSelection
    }
}

/// Parse la liste de périphériques avfoundation (stderr de
/// `ffmpeg -f avfoundation -list_devices true -i ""`) et renvoie les écrans :
/// (index de périphérique, numéro d'écran) pour chaque ligne "[N] Capture screen M".
pub fn parse_avfoundation_screens(stderr: &str) -> Vec<(u32, u32)> {
    let mut out = Vec::new();
    for line in stderr.lines() {
        if let Some(pos) = line.find("Capture screen ") {
            let screen_no = line[pos + "Capture screen ".len()..]
                .trim()
                .parse::<u32>()
                .ok();
            // L'index de périphérique est le dernier "[N]" avant le nom.
            let device_idx = line[..pos]
                .rfind('[')
                .and_then(|i| line[i + 1..].split(']').next())
                .and_then(|s| s.parse::<u32>().ok());
            if let (Some(d), Some(s)) = (device_idx, screen_no) {
                out.push((d, s));
            }
        }
    }
    out
}

/// Extrait le temps de progression (en secondes) d'une ligne stderr ffmpeg
/// ("... time=00:01:02.50 ...").
pub fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    let idx = line.find("time=")?;
    let rest = &line[idx + 5..];
    let token = rest.split_whitespace().next()?;
    let mut parts = token.split(':');
    let h: f64 = parts.next()?.parse().ok()?;
    let m: f64 = parts.next()?.parse().ok()?;
    let s: f64 = parts.next()?.parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

/// Pastille rouge (disque plein sur fond transparent) pour l'icône de tray en
/// enregistrement. RGBA, `size`×`size`.
pub fn recording_badge_rgba(size: u32) -> Vec<u8> {
    let mut px = vec![0u8; (size * size * 4) as usize];
    let c = (size as f32 - 1.0) / 2.0;
    let r = size as f32 * 0.42;
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 - c;
            let dy = y as f32 - c;
            if (dx * dx + dy * dy).sqrt() <= r {
                let i = ((y * size + x) * 4) as usize;
                px[i] = 220;
                px[i + 1] = 40;
                px[i + 2] = 40;
                px[i + 3] = 255;
            }
        }
    }
    px
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn even_dim_rounds_down_to_even_with_min_2() {
        assert_eq!(even_dim(7), 6);
        assert_eq!(even_dim(8), 8);
        assert_eq!(even_dim(1), 2);
        assert_eq!(even_dim(0), 2);
    }

    #[test]
    fn windows_args_use_ddagrab_with_region_fps_and_cursor() {
        let args = windows_capture_args(
            1,
            Region { x: 10, y: 20, width: 641, height: 480 },
            &RecordOptions { fps: 30, cursor: true },
            "out.mp4",
        );
        let joined = args.join(" ");
        assert!(joined.contains("ddagrab=output_idx=1"));
        assert!(joined.contains("framerate=30"));
        assert!(joined.contains("offset_x=10:offset_y=20"));
        // 641 arrondi pair → 640
        assert!(joined.contains("video_size=640x480"));
        assert!(joined.contains("draw_mouse=1"));
        assert!(joined.contains("hwdownload"));
        assert!(joined.contains("-movflags"));
        assert!(joined.contains("+frag_keyframe+empty_moov"));
        assert_eq!(args.last().unwrap(), "out.mp4");
    }

    #[test]
    fn windows_args_hide_cursor_when_disabled() {
        let args = windows_capture_args(
            0,
            Region { x: 0, y: 0, width: 100, height: 100 },
            &RecordOptions { fps: 30, cursor: false },
            "o.mp4",
        );
        assert!(args.join(" ").contains("draw_mouse=0"));
    }

    #[test]
    fn macos_args_use_avfoundation_and_pixel_crop() {
        let args = macos_capture_args(
            3,
            Region { x: 4, y: 8, width: 300, height: 201 },
            &RecordOptions { fps: 30, cursor: true },
            "out.mp4",
        );
        let joined = args.join(" ");
        assert!(joined.contains("-f avfoundation"));
        assert!(joined.contains("-capture_cursor 1"));
        assert!(joined.contains("-framerate 30"));
        assert!(joined.contains("-i 3:none"));
        // crop=w:h:x:y en pixels, hauteur 201 arrondie → 200
        assert!(joined.contains("crop=300:200:4:8"));
        assert_eq!(args.last().unwrap(), "out.mp4");
    }

    #[test]
    fn export_args_mp4_with_trim_crop_and_speed() {
        let opts = ExportOptions {
            trim_start: 1.5,
            trim_end: 9.0,
            crop: Some(Region { x: 2, y: 4, width: 500, height: 301 }),
            speed: 2.0,
            gif: false,
        };
        let args = export_args("in.mp4", &opts, "out.mp4");
        let joined = args.join(" ");
        assert!(joined.contains("-ss 1.5"));
        assert!(joined.contains("-to 9"));
        assert!(joined.contains("crop=500:300:2:4"));
        assert!(joined.contains("setpts=PTS/2"));
        assert!(joined.contains("+faststart"));
        assert!(!joined.contains("palettegen"));
    }

    #[test]
    fn export_args_mp4_without_filters_omits_vf() {
        let opts = ExportOptions {
            trim_start: 0.0,
            trim_end: 5.0,
            crop: None,
            speed: 1.0,
            gif: false,
        };
        let args = export_args("in.mp4", &opts, "out.mp4");
        assert!(!args.contains(&"-vf".to_string()));
    }

    #[test]
    fn export_args_gif_uses_two_pass_palette_at_15fps() {
        let opts = ExportOptions {
            trim_start: 0.0,
            trim_end: 3.0,
            crop: None,
            speed: 1.0,
            gif: true,
        };
        let args = export_args("in.mp4", &opts, "out.gif");
        let joined = args.join(" ");
        assert!(joined.contains("fps=15"));
        assert!(joined.contains("palettegen"));
        assert!(joined.contains("paletteuse"));
        assert_eq!(args.last().unwrap(), "out.gif");
    }

    #[test]
    fn shortcut_action_follows_state() {
        assert!(matches!(on_record_shortcut(false, false), ShortcutAction::StartSelection));
        assert!(matches!(on_record_shortcut(true, false), ShortcutAction::Stop));
        assert!(matches!(on_record_shortcut(false, true), ShortcutAction::Ignore));
        // "recording" prime sur "busy" : on peut toujours arrêter.
        assert!(matches!(on_record_shortcut(true, true), ShortcutAction::Stop));
    }

    #[test]
    fn parses_avfoundation_screen_devices() {
        let stderr = r#"[AVFoundation indev @ 0x7f8] AVFoundation video devices:
[AVFoundation indev @ 0x7f8] [0] FaceTime HD Camera
[AVFoundation indev @ 0x7f8] [1] Capture screen 0
[AVFoundation indev @ 0x7f8] [2] Capture screen 1
[AVFoundation indev @ 0x7f8] AVFoundation audio devices:
[AVFoundation indev @ 0x7f8] [0] MacBook Pro Microphone"#;
        assert_eq!(parse_avfoundation_screens(stderr), vec![(1, 0), (2, 1)]);
    }

    #[test]
    fn parses_ffmpeg_progress_time() {
        let line = "frame=  120 fps= 30 q=23.0 size=     512KiB time=00:01:02.50 bitrate= 900kbits/s";
        assert_eq!(parse_ffmpeg_time(line), Some(62.5));
        assert_eq!(parse_ffmpeg_time("no time here"), None);
    }

    #[test]
    fn recording_badge_is_rgba_square_with_red_center() {
        let size = 16u32;
        let px = recording_badge_rgba(size);
        assert_eq!(px.len(), (size * size * 4) as usize);
        // Centre : rouge opaque. Coin : transparent.
        let c = ((8 * size + 8) * 4) as usize;
        assert_eq!(&px[c..c + 4], &[220, 40, 40, 255]);
        assert_eq!(px[3], 0);
    }
}
