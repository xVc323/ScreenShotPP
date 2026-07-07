//! Enregistrement vidéo : pilotage du sidecar ffmpeg (spawn, arrêt propre via
//! 'q' sur stdin, fichier temporaire), et ouverture du mini-éditeur à l'arrêt.
//! Toute la construction d'arguments est dans `screenshotpp_core::record`.

use screenshotpp_core::record as core_record;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub struct RecordingState(pub Mutex<Inner>);

#[derive(Default)]
pub struct Inner {
    pub child: Option<Child>,
    pub file: Option<PathBuf>,
    /// Dernier fichier finalisé, servi au mini-éditeur.
    pub last_file: Option<PathBuf>,
}

impl Default for RecordingState {
    fn default() -> Self {
        RecordingState(Mutex::new(Inner::default()))
    }
}

pub fn is_recording(app: &AppHandle) -> bool {
    app.state::<RecordingState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .child
        .is_some()
}

/// Résout le binaire ffmpeg embarqué : Tauri place les externalBin à côté de
/// l'exécutable de l'app (en dev comme en bundle).
fn resolve_ffmpeg() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("Exécutable sans dossier parent")?;
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let path = dir.join(name);
    if path.exists() {
        Ok(path)
    } else {
        Err(format!(
            "ffmpeg introuvable ({}). Le sidecar n'est pas installé ?",
            path.display()
        ))
    }
}

/// Dossier des enregistrements temporaires ($APPDATA/recordings, créé au besoin).
pub fn recordings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recordings");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Index du périphérique avfoundation "Capture screen N" pour l'écran N (macOS).
#[cfg(target_os = "macos")]
fn avfoundation_device_for_screen(ffmpeg: &PathBuf, screen_no: u32) -> Result<u32, String> {
    let out = Command::new(ffmpeg)
        .args(["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""])
        .output()
        .map_err(|e| format!("Énumération avfoundation échouée: {e}"))?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    core_record::parse_avfoundation_screens(&stderr)
        .into_iter()
        .find(|(_, s)| *s == screen_no)
        .map(|(d, _)| d)
        .ok_or_else(|| format!("Aucun périphérique avfoundation pour l'écran {screen_no}"))
}

/// Lance ffmpeg sur la région (pixels, relative au moniteur capturé).
pub fn start(app: &AppHandle, monitor_index: usize, region: core_record::Region) -> Result<(), String> {
    let (fps, cursor) = {
        let st = app.state::<crate::settings::SettingsState>();
        let s = st.0.lock().unwrap_or_else(|e| e.into_inner());
        (s.record_fps.max(1), s.record_cursor)
    };
    let opts = core_record::RecordOptions { fps, cursor };
    let ffmpeg = resolve_ffmpeg()?;
    let file = recordings_dir(app)?.join(format!(
        "recording-{}.mp4",
        chrono::Local::now().format("%Y%m%d-%H%M%S")
    ));
    let out_path = file.to_string_lossy().to_string();

    #[cfg(windows)]
    let args = core_record::windows_capture_args(monitor_index as u32, region, &opts, &out_path);
    #[cfg(target_os = "macos")]
    let args = {
        let device = avfoundation_device_for_screen(&ffmpeg, monitor_index as u32)?;
        core_record::macos_capture_args(device, region, &opts, &out_path)
    };
    #[cfg(not(any(windows, target_os = "macos")))]
    let args: Vec<String> = {
        let _ = (region, opts, out_path);
        return Err("Enregistrement non pris en charge sur cette plateforme".into());
    };

    let child = Command::new(&ffmpeg)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Lancement de ffmpeg échoué: {e}"))?;

    let st = app.state::<RecordingState>();
    let mut inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
    inner.child = Some(child);
    inner.file = Some(file);
    Ok(())
}

/// Arrête l'enregistrement : 'q' sur stdin (finalisation propre), kill après 5 s,
/// puis ouvre le mini-éditeur sur le fichier produit.
pub fn stop(app: &AppHandle) -> Result<(), String> {
    let (mut child, file) = {
        let st = app.state::<RecordingState>();
        let mut inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
        match (inner.child.take(), inner.file.take()) {
            (Some(c), Some(f)) => (c, f),
            _ => return Err("Aucun enregistrement en cours".into()),
        }
    };
    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"q");
    }
    // Attente bornée de la finalisation ; au-delà on tue (le MP4 fragmenté
    // reste lisible même tué).
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() < deadline => {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
        }
    }
    {
        let st = app.state::<RecordingState>();
        st.0.lock().unwrap_or_else(|e| e.into_inner()).last_file = Some(file);
    }
    crate::tray::set_recording(app, false);
    open_recorder(app)
}

/// Ouvre (ou ré-ouvre) la fenêtre du mini-éditeur.
fn open_recorder(app: &AppHandle) -> Result<(), String> {
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window("recorder") {
            let _ = w.close();
        }
        let builder = WebviewWindowBuilder::new(
            &app2,
            "recorder",
            WebviewUrl::App("recorder/recorder.html".into()),
        )
        .title("ScreenShotPP — Recording")
        .inner_size(960.0, 680.0)
        .resizable(true);
        if let Err(e) = builder.build() {
            eprintln!("Création de la fenêtre recorder échouée: {e}");
        }
    })
    .map_err(|e| e.to_string())
}

/// Commande invoquée par l'overlay en mode vidéo, avec le rect sélectionné
/// (pixels, relatif à l'image du moniteur = relatif au moniteur).
#[tauri::command]
pub fn start_recording(app: AppHandle, rect: core_record::Region) -> Result<(), String> {
    let monitor_index = {
        let st = app.state::<crate::commands::CaptureState>();
        let guard = st.0.lock().unwrap_or_else(|e| e.into_inner());
        let session = guard.as_ref().ok_or("Aucune sélection vidéo en cours")?;
        if session.mode != crate::commands::CaptureMode::Video {
            return Err("La session courante n'est pas une sélection vidéo".into());
        }
        session.monitor_index
    };
    // Ferme l'overlay AVANT de démarrer (il ne doit pas apparaître dans la vidéo).
    let app_close = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = app_close.get_webview_window("overlay") {
            let _ = w.close();
        }
    });
    // Laisse le compositor retirer l'overlay (même délai que la capture différée).
    std::thread::sleep(std::time::Duration::from_millis(120));
    start(&app, monitor_index, rect)?;
    crate::tray::set_recording(&app, true);
    Ok(())
}

/// Chemin + nom du dernier enregistrement, pour le mini-éditeur.
#[tauri::command]
pub fn get_recording_info(app: AppHandle) -> Result<String, String> {
    app.state::<RecordingState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .last_file
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or("Aucun enregistrement disponible".into())
}

/// Supprime le fichier temporaire (abandon depuis l'éditeur).
#[tauri::command]
pub fn discard_recording(app: AppHandle) -> Result<(), String> {
    let file = app
        .state::<RecordingState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .last_file
        .take();
    if let Some(f) = file {
        let _ = std::fs::remove_file(f);
    }
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub trim_start: f64,
    pub trim_end: f64,
    pub crop: Option<core_record::Region>,
    pub speed: f64,
    pub gif: bool,
    pub output_path: String,
}

/// Exporte le dernier enregistrement selon les options du mini-éditeur.
/// Bloquant côté worker (spawn_blocking) ; la progression est émise à la
/// fenêtre recorder via l'événement "export-progress" (secondes traitées).
#[tauri::command]
pub async fn export_recording(app: AppHandle, options: ExportRequest) -> Result<(), String> {
    use tauri::Emitter;
    let input = app
        .state::<RecordingState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .last_file
        .clone()
        .ok_or("Aucun enregistrement disponible")?;
    let ffmpeg = resolve_ffmpeg()?;
    let core_opts = core_record::ExportOptions {
        trim_start: options.trim_start,
        trim_end: options.trim_end,
        crop: options.crop,
        speed: options.speed,
        gif: options.gif,
    };
    let args = core_record::export_args(&input.to_string_lossy(), &core_opts, &options.output_path);
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::{BufRead, BufReader};
        let mut child = Command::new(&ffmpeg)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Lancement de l'export ffmpeg échoué: {e}"))?;
        if let Some(stderr) = child.stderr.take() {
            // ffmpeg écrit la progression avec des \r ; on lit donc par blocs CR.
            let reader = BufReader::new(stderr);
            for chunk in reader.split(b'\r') {
                let Ok(bytes) = chunk else { break };
                let line = String::from_utf8_lossy(&bytes);
                if let Some(secs) = core_record::parse_ffmpeg_time(&line) {
                    let _ = app2.emit_to("recorder", "export-progress", secs);
                }
            }
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("Export ffmpeg terminé en erreur ({status})"));
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;
    // Export réussi : le temporaire ne sert plus.
    let file = app
        .state::<RecordingState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .last_file
        .take();
    if let Some(f) = file {
        let _ = std::fs::remove_file(f);
    }
    Ok(())
}
