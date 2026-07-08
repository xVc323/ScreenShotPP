//! Enregistrement vidéo : pilotage du sidecar ffmpeg (spawn, arrêt propre via
//! 'q' sur stdin, fichier temporaire), et ouverture du mini-éditeur à l'arrêt.
//! Toute la construction d'arguments est dans `screenshotpp_core::record`.

use screenshotpp_core::record as core_record;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub struct RecordingState(pub Mutex<Inner>);

/// Sur Windows, empêche l'ouverture d'une fenêtre de console (terminal noir)
/// lors du spawn de ffmpeg via le flag CREATE_NO_WINDOW. No-op ailleurs.
fn no_console(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Session d'enregistrement en cours : région ciblée, options, et segments
/// produits (un segment par intervalle démarrer→pause ; concaténés à l'arrêt).
pub struct RecordSession {
    pub monitor_index: usize,
    pub region: core_record::Region,
    pub opts: core_record::RecordOptions,
    pub dir: PathBuf,
    pub base: String,
    /// Index de capture passé à ffmpeg : output_idx DXGI (Windows) ou
    /// périphérique avfoundation (macOS). Résolu une fois au démarrage.
    pub capture_index: u32,
    pub segments: Vec<PathBuf>,
    pub paused: bool,
}

#[derive(Default)]
pub struct Inner {
    /// Process ffmpeg du segment courant (None quand en pause ou arrêté).
    pub child: Option<Child>,
    pub session: Option<RecordSession>,
    /// Dernier fichier finalisé, servi au mini-éditeur.
    pub last_file: Option<PathBuf>,
    pub export_child: Option<Arc<Mutex<Child>>>,
    pub exported_files: Vec<PathBuf>,
}

impl Default for RecordingState {
    fn default() -> Self {
        RecordingState(Mutex::new(Inner::default()))
    }
}

/// Vrai tant qu'une session est active (y compris en pause) : le raccourci et
/// le tray peuvent alors toujours l'arrêter.
pub fn is_recording(app: &AppHandle) -> bool {
    app.state::<RecordingState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .session
        .is_some()
}

/// Résout le binaire ffmpeg embarqué : Tauri place les externalBin à côté de
/// l'exécutable de l'app (en dev comme en bundle).
fn resolve_ffmpeg() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("Exécutable sans dossier parent")?;
    let name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
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
        .args([
            "-hide_banner",
            "-f",
            "avfoundation",
            "-list_devices",
            "true",
            "-i",
            "",
        ])
        .output()
        .map_err(|e| format!("Énumération avfoundation échouée: {e}"))?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    core_record::parse_avfoundation_screens(&stderr)
        .into_iter()
        .find(|(_, s)| *s == screen_no)
        .map(|(d, _)| d)
        .ok_or_else(|| format!("Aucun périphérique avfoundation pour l'écran {screen_no}"))
}

/// Construit les args ffmpeg de capture d'un segment vers `out_path` selon l'OS.
fn segment_args(session: &RecordSession, out_path: &str) -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        Ok(core_record::windows_capture_args(
            session.capture_index,
            session.region,
            &session.opts,
            out_path,
        ))
    }
    #[cfg(target_os = "macos")]
    {
        Ok(core_record::macos_capture_args(
            session.capture_index,
            session.region,
            &session.opts,
            out_path,
        ))
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (session, out_path);
        Err("Enregistrement non pris en charge sur cette plateforme".into())
    }
}

/// Lance ffmpeg pour le prochain segment de la session ; renvoie le process et
/// le chemin du fichier segment (indexé par le nombre de segments déjà présents).
fn spawn_segment(ffmpeg: &PathBuf, session: &RecordSession) -> Result<(Child, PathBuf), String> {
    let idx = session.segments.len();
    let out = session.dir.join(format!("{}-seg{}.mp4", session.base, idx));
    let out_path = out.to_string_lossy().to_string();
    let args = segment_args(session, &out_path)?;
    let child = no_console(&mut Command::new(ffmpeg))
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Lancement de ffmpeg échoué: {e}"))?;
    Ok((child, out))
}

/// Finalise proprement un process ffmpeg : 'q' sur stdin, puis kill après 5 s
/// (le MP4 fragmenté reste lisible même tué).
fn finalize_child(mut child: Child) {
    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"q");
    }
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
}

/// Démarre l'enregistrement de la région (pixels, relative au moniteur capturé) :
/// crée la session et lance le premier segment ffmpeg.
pub fn start(
    app: &AppHandle,
    monitor_index: usize,
    region: core_record::Region,
) -> Result<(), String> {
    let (fps, cursor) = {
        let st = app.state::<crate::settings::SettingsState>();
        let s = st.0.lock().unwrap_or_else(|e| e.into_inner());
        (s.record_fps.max(1), s.record_cursor)
    };
    let opts = core_record::RecordOptions { fps, cursor };
    let ffmpeg = resolve_ffmpeg()?;
    let dir = recordings_dir(app)?;
    let base = format!("recording-{}", chrono::Local::now().format("%Y%m%d-%H%M%S"));

    // Index de capture ffmpeg, résolu une fois (sur macOS : énumération avfoundation).
    #[cfg(windows)]
    let capture_index: u32 = monitor_index as u32;
    #[cfg(target_os = "macos")]
    let capture_index: u32 = avfoundation_device_for_screen(&ffmpeg, monitor_index as u32)?;
    #[cfg(not(any(windows, target_os = "macos")))]
    let capture_index: u32 = {
        let _ = (&ffmpeg, &dir, &base, &opts, region, monitor_index);
        return Err("Enregistrement non pris en charge sur cette plateforme".into());
    };

    let mut session = RecordSession {
        monitor_index,
        region,
        opts,
        dir,
        base,
        capture_index,
        segments: Vec::new(),
        paused: false,
    };
    let (child, seg) = spawn_segment(&ffmpeg, &session)?;
    session.segments.push(seg);

    let st = app.state::<RecordingState>();
    let mut inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
    inner.child = Some(child);
    inner.session = Some(session);
    Ok(())
}

/// Met l'enregistrement en pause : finalise le segment courant (il sera concaténé
/// à l'arrêt). Idempotent si déjà en pause.
pub fn pause(app: &AppHandle) -> Result<(), String> {
    let child = {
        let st = app.state::<RecordingState>();
        let mut inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
        match inner.session {
            None => return Err("Aucun enregistrement en cours".into()),
            Some(ref s) if s.paused => return Ok(()),
            _ => {}
        }
        let child = inner.child.take();
        if let Some(s) = inner.session.as_mut() {
            s.paused = true;
        }
        child
    };
    if let Some(c) = child {
        finalize_child(c); // hors verrou : peut bloquer jusqu'à 5 s
    }
    Ok(())
}

/// Reprend l'enregistrement après une pause : lance un nouveau segment ffmpeg.
pub fn resume(app: &AppHandle) -> Result<(), String> {
    let ffmpeg = resolve_ffmpeg()?;
    let st = app.state::<RecordingState>();
    let mut inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
    match inner.session {
        None => return Err("Aucun enregistrement en cours".into()),
        Some(ref s) if !s.paused => return Ok(()),
        _ => {}
    }
    let (child, seg) = {
        let s = inner.session.as_ref().unwrap();
        spawn_segment(&ffmpeg, s)?
    };
    if let Some(s) = inner.session.as_mut() {
        s.segments.push(seg);
        s.paused = false;
    }
    inner.child = Some(child);
    Ok(())
}

/// Arrête l'enregistrement : finalise le segment courant, concatène les segments
/// si nécessaire, ferme le HUD et ouvre le mini-éditeur sur le fichier produit.
pub fn stop(app: &AppHandle) -> Result<(), String> {
    let (child, session) = {
        let st = app.state::<RecordingState>();
        let mut inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
        (inner.child.take(), inner.session.take())
    };
    let session = session.ok_or("Aucun enregistrement en cours")?;
    if let Some(c) = child {
        finalize_child(c);
    }

    // Un seul segment : c'est directement le résultat. Sinon on concatène sans
    // réencodage (les segments partagent les mêmes paramètres d'encodage).
    let result = if session.segments.len() <= 1 {
        session
            .segments
            .into_iter()
            .next()
            .ok_or("Aucun segment enregistré")?
    } else {
        concat_segments(&session)?
    };

    {
        let st = app.state::<RecordingState>();
        st.0.lock().unwrap_or_else(|e| e.into_inner()).last_file = Some(result);
    }
    close_hud(app);
    crate::tray::set_recording(app, false);
    open_recorder(app)
}

/// Concatène les segments d'une session (démultiplexeur `concat`, `-c copy`).
/// En cas d'échec, retombe sur le premier segment pour ne rien perdre.
fn concat_segments(session: &RecordSession) -> Result<PathBuf, String> {
    let ffmpeg = resolve_ffmpeg()?;
    let list = session.dir.join(format!("{}-list.txt", session.base));
    let paths: Vec<String> = session
        .segments
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    std::fs::write(&list, core_record::concat_list_contents(&paths)).map_err(|e| e.to_string())?;
    let out = session.dir.join(format!("{}.mp4", session.base));
    let args = core_record::concat_args(&list.to_string_lossy(), &out.to_string_lossy());
    let status = no_console(&mut Command::new(&ffmpeg))
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Concaténation ffmpeg échouée: {e}"))?;
    let _ = std::fs::remove_file(&list);
    if status.success() {
        for seg in &session.segments {
            let _ = std::fs::remove_file(seg);
        }
        Ok(out)
    } else {
        // Repli : au moins le premier segment reste exploitable.
        Ok(session.segments[0].clone())
    }
}

/// Ouvre les fenêtres du HUD d'enregistrement : liseré rouge autour de la région
/// (plein moniteur, click-through) et barre de contrôle (chrono, pause, stop),
/// toutes deux positionnées/dessinées HORS de la région → absentes de la vidéo.
fn open_hud(app: &AppHandle, monitor_index: usize, region: core_record::Region) {
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        let monitors = app2.available_monitors().unwrap_or_default();
        let Some(m) = monitors.get(monitor_index).or_else(|| monitors.first()) else {
            return;
        };
        let pos = m.position();
        let size = m.size();
        let sf = m.scale_factor();
        let (mon_x, mon_y) = (pos.x as f64 / sf, pos.y as f64 / sf);
        let (mon_w, mon_h) = (size.width as f64 / sf, size.height as f64 / sf);

        // Liseré : fenêtre plein moniteur, transparente, click-through. On la
        // construit INVISIBLE, on active le click-through, PUIS on l'affiche —
        // sinon une fenêtre plein écran topmost capte tous les clics avant que
        // le click-through ne soit posé → l'app paraît figée.
        if let Some(w) = app2.get_webview_window("rec-border") {
            let _ = w.close();
        }
        let border = WebviewWindowBuilder::new(
            &app2,
            "rec-border",
            WebviewUrl::App("recorder/hud-border.html".into()),
        )
        .title("rec-border")
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .resizable(false)
        .visible(false)
        .transparent(true)
        .shadow(false)
        .inner_size(mon_w, mon_h)
        .position(mon_x, mon_y);
        match border.build() {
            Ok(w) => {
                let _ = w.set_ignore_cursor_events(true);
                let _ = w.show();
            }
            Err(e) => eprintln!("Création du liseré d'enregistrement échouée: {e}"),
        }

        // Barre de contrôle : petite fenêtre placée juste hors de la région.
        let (bar_w, bar_h, gap) = (240.0_f64, 48.0_f64, 10.0_f64);
        let (reg_x, reg_y) = (region.x as f64 / sf, region.y as f64 / sf);
        let (reg_w, reg_h) = (region.width as f64 / sf, region.height as f64 / sf);
        let below = reg_y + reg_h + gap;
        let above = reg_y - gap - bar_h;
        let cy_local = if below + bar_h <= mon_h {
            below
        } else if above >= 0.0 {
            above
        } else {
            0.0
        };
        let cx_local = (reg_x + (reg_w - bar_w) / 2.0)
            .max(0.0)
            .min((mon_w - bar_w).max(0.0));
        let cy_local = cy_local.max(0.0).min((mon_h - bar_h).max(0.0));

        if let Some(w) = app2.get_webview_window("rec-controls") {
            let _ = w.close();
        }
        let ctrl = WebviewWindowBuilder::new(
            &app2,
            "rec-controls",
            WebviewUrl::App("recorder/hud-controls.html".into()),
        )
        .title("Recording")
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .resizable(false)
        .visible(false)
        .transparent(true)
        .shadow(false)
        .inner_size(bar_w, bar_h)
        .position(mon_x + cx_local, mon_y + cy_local);
        match ctrl.build() {
            Ok(w) => {
                let _ = w.show();
            }
            Err(e) => eprintln!("Création de la barre d'enregistrement échouée: {e}"),
        }
    });
}

/// Ferme les fenêtres du HUD d'enregistrement.
fn close_hud(app: &AppHandle) {
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        for label in ["rec-border", "rec-controls"] {
            if let Some(w) = app2.get_webview_window(label) {
                let _ = w.close();
            }
        }
    });
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
    // Tout le travail lourd (fermeture overlay, spawn ffmpeg, création des
    // fenêtres HUD) est déporté hors du thread principal — comme la capture
    // différée — pour ne jamais figer l'UI.
    std::thread::spawn(move || {
        let app_close = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(w) = app_close.get_webview_window("overlay") {
                let _ = w.close();
            }
        });
        // Laisse le compositor retirer l'overlay (même délai que la capture différée).
        std::thread::sleep(std::time::Duration::from_millis(120));
        if let Err(e) = start(&app, monitor_index, rect) {
            eprintln!("Démarrage d'enregistrement échoué: {e}");
            return;
        }
        open_hud(&app, monitor_index, rect);
        crate::tray::set_recording(&app, true);
    });
    Ok(())
}

/// Met l'enregistrement en cours en pause (bouton du HUD).
#[tauri::command]
pub fn pause_recording(app: AppHandle) -> Result<(), String> {
    pause(&app)
}

/// Reprend un enregistrement en pause (bouton du HUD).
#[tauri::command]
pub fn resume_recording(app: AppHandle) -> Result<(), String> {
    resume(&app)
}

/// Arrête l'enregistrement (bouton du HUD). Le finalize ffmpeg, la concaténation
/// et l'ouverture du mini-éditeur sont déportés hors du thread principal.
#[tauri::command]
pub fn stop_recording(app: AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        if let Err(e) = stop(&app) {
            eprintln!("Arrêt d'enregistrement échoué: {e}");
        }
    });
    Ok(())
}

/// Rectangle de la région en points logiques, relatif au moniteur, pour que le
/// liseré du HUD se dessine exactement autour de la zone capturée.
#[derive(serde::Serialize)]
pub struct HudInfo {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[tauri::command]
pub fn recording_hud_info(app: AppHandle) -> Result<HudInfo, String> {
    let (monitor_index, region) = {
        let st = app.state::<RecordingState>();
        let inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
        let s = inner
            .session
            .as_ref()
            .ok_or("Aucun enregistrement en cours")?;
        (s.monitor_index, s.region)
    };
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let sf = monitors
        .get(monitor_index)
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    Ok(HudInfo {
        x: region.x as f64 / sf,
        y: region.y as f64 / sf,
        width: region.width as f64 / sf,
        height: region.height as f64 / sf,
    })
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

fn normalized_existing_path(path: &PathBuf) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.clone())
}

#[tauri::command]
pub fn close_recorder(app: AppHandle) -> Result<(), String> {
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window("recorder") {
            let _ = w.close();
        }
    })
    .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub trim_start: f64,
    pub trim_end: f64,
    pub crop: Option<core_record::Region>,
    pub speed: f64,
    pub gif: bool,
    pub preset: String,
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
        preset: core_record::ExportPreset::from_str(&options.preset, options.gif),
    };
    let output_path = PathBuf::from(&options.output_path);
    let output_path_for_state = output_path.clone();
    let args = core_record::export_args(&input.to_string_lossy(), &core_opts, &options.output_path);
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::{BufRead, BufReader};
        let child = no_console(&mut Command::new(&ffmpeg))
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Lancement de l'export ffmpeg échoué: {e}"))?;
        let export_child = Arc::new(Mutex::new(child));
        {
            let st = app2.state::<RecordingState>();
            st.0.lock().unwrap_or_else(|e| e.into_inner()).export_child =
                Some(export_child.clone());
        }
        let mut child = export_child.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(stderr) = child.stderr.take() {
            drop(child);
            // ffmpeg écrit la progression avec des \r ; on lit donc par blocs CR.
            let reader = BufReader::new(stderr);
            for chunk in reader.split(b'\r') {
                let Ok(bytes) = chunk else { break };
                let line = String::from_utf8_lossy(&bytes);
                if let Some(secs) = core_record::parse_ffmpeg_time(&line) {
                    let _ = app2.emit_to("recorder", "export-progress", secs);
                }
            }
            child = export_child.lock().unwrap_or_else(|e| e.into_inner());
        }
        let status = child.wait().map_err(|e| e.to_string());
        drop(child);
        {
            let st = app2.state::<RecordingState>();
            st.0.lock().unwrap_or_else(|e| e.into_inner()).export_child = None;
        }
        match status {
            Ok(status) if status.success() => Ok::<(), String>(()),
            Ok(status) => {
                let _ = std::fs::remove_file(&output_path);
                Err(format!("Export ffmpeg terminé en erreur ({status})"))
            }
            Err(e) => {
                let _ = std::fs::remove_file(&output_path);
                Err(e)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    // On garde le temporaire comme source de travail : l'utilisateur peut exporter
    // en GIF, ajuster le trim/crop/vitesse, puis exporter à nouveau en MP4.
    // Le bouton Discard reste le chemin explicite pour supprimer ce fichier.
    {
        let exported = normalized_existing_path(&output_path_for_state);
        let st = app.state::<RecordingState>();
        let mut inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
        if !inner.exported_files.iter().any(|p| p == &exported) {
            inner.exported_files.push(exported);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_export(app: AppHandle) -> Result<(), String> {
    let child = app
        .state::<RecordingState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .export_child
        .clone();
    if let Some(child) = child {
        let _ = child.lock().unwrap_or_else(|e| e.into_inner()).kill();
    }
    Ok(())
}

#[tauri::command]
pub fn delete_recording_export(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if ext != "mp4" && ext != "gif" {
        return Err("Unsupported export type".into());
    }
    let target = normalized_existing_path(&path);
    let idx = {
        let st = app.state::<RecordingState>();
        let inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
        inner
            .exported_files
            .iter()
            .position(|p| normalized_existing_path(p) == target)
            .ok_or("Unknown recording export")?
    };
    if path.exists() {
        std::fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    let st = app.state::<RecordingState>();
    let mut inner = st.0.lock().unwrap_or_else(|e| e.into_inner());
    if idx < inner.exported_files.len()
        && normalized_existing_path(&inner.exported_files[idx]) == target
    {
        inner.exported_files.remove(idx);
    } else {
        inner
            .exported_files
            .retain(|p| normalized_existing_path(p) != target);
    }
    Ok(())
}
