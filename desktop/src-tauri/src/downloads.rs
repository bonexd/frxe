use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Mutex,
};

use sysinfo::{Pid, System};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use walkdir::WalkDir;

use crate::{models::{DownloadProgress, Track}, runtime};

#[derive(Default)]
pub struct DownloadManager {
    processes: Mutex<HashMap<String, u32>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DownloadStrategy {
    SealFirst,
    VitrFallback,
}

#[derive(Debug)]
struct DownloadAttemptError {
    detail: String,
    cancelled: bool,
}

fn download_strategies() -> Vec<DownloadStrategy> {
    vec![
        DownloadStrategy::SealFirst,
        DownloadStrategy::VitrFallback,
    ]
}

fn allowed_audio(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|v| v.to_str()).map(|v| v.to_ascii_lowercase()).as_deref(),
        Some("mp3" | "m4a" | "flac" | "wav" | "opus" | "ogg" | "webm")
    )
}

fn allow_media_directory(app: &AppHandle, root: &Path) -> Result<(), String> {
    let absolute = root
        .canonicalize()
        .map_err(|e| format!("Could not authorize media folder: {e}"))?;
    app.asset_protocol_scope()
        .allow_directory(&absolute, true)
        .map_err(|e| format!("Could not authorize media folder: {e}"))
}

#[tauri::command]
pub fn authorize_media_path(app: AppHandle, path: String) -> Result<(), String> {
    let media_path = PathBuf::from(path);
    let parent = media_path
        .parent()
        .ok_or_else(|| "Local media path has no parent folder".to_string())?;
    if !media_path.is_file() || !parent.is_dir() {
        return Err("Local media file is unavailable".to_string());
    }
    allow_media_directory(&app, parent)
}

fn validated_child_path(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|e| format!("Could not open download folder: {e}"))?;
    let target = if target.exists() {
        target.canonicalize().map_err(|e| format!("Could not open target file: {e}"))?
    } else {
        let parent = target.parent().ok_or_else(|| "Target has no parent folder".to_string())?;
        let parent = parent.canonicalize().map_err(|e| format!("Could not open target folder: {e}"))?;
        let name = target.file_name().ok_or_else(|| "Target has no file name".to_string())?;
        parent.join(name)
    };
    if !target.starts_with(&root) {
        return Err("Refusing to access a file outside the selected Music folder".to_string());
    }
    Ok(target)
}

fn parse_progress(line: &str) -> Option<DownloadProgress> {
    let rest = line.trim().strip_prefix("VITR:")?;
    let mut parts = rest.splitn(4, '|');
    let percent = parts.next()?.trim().trim_end_matches('%').trim().parse::<f64>().ok()?;
    let speed = parts.next().unwrap_or("").trim().to_string();
    let eta = parts.next().unwrap_or("").trim().to_string();
    let item_title = parts.next().unwrap_or("").trim().to_string();
    Some(DownloadProgress {
        task_id: String::new(),
        percent,
        speed,
        eta,
        item_title,
    })
}

#[tauri::command]
pub fn default_download_dir() -> Result<String, String> {
    let root = dirs::audio_dir()
        .or_else(dirs::download_dir)
        .ok_or_else(|| "Could not locate your Music or Downloads folder".to_string())?
        .join("Vitr");
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("Could not create Vitr download folder: {e}"))?;
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn scan_downloads(app: AppHandle, dir: String) -> Result<Vec<Track>, String> {
    let root = PathBuf::from(dir);
    if !root.is_dir() { return Ok(Vec::new()); }
    allow_media_directory(&app, &root)?;
    let mut tracks = Vec::new();
    for entry in WalkDir::new(&root).max_depth(2).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !entry.file_type().is_file() || !allowed_audio(path) { continue; }
        let absolute = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let title = absolute.file_stem().and_then(|v| v.to_str()).unwrap_or("Offline track").to_string();
        let path_string = absolute.to_string_lossy().into_owned();
        tracks.push(Track {
            id: path_string.clone(),
            kind: "local".to_string(),
            title,
            artist: "Offline".to_string(),
            album: None,
            cover: None,
            duration_seconds: None,
            source: Some("Offline".to_string()),
            path: Some(path_string),
        });
    }
    tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(tracks)
}

#[tauri::command]
pub async fn clear_removed_downloads(download_dir: String) -> Result<u32, String> {
    let _ = download_dir;
    Ok(0)
}

#[tauri::command]
pub async fn download_already_exists(video_id: String, output_dir: String) -> Result<bool, String> {
    if video_id.is_empty() { return Ok(false); }
    let root = PathBuf::from(output_dir);
    if !root.is_dir() { return Ok(false); }
    let marker = format!("[{video_id}]");
    Ok(WalkDir::new(root)
        .max_depth(2)
        .into_iter()
        .filter_map(Result::ok)
        .any(|entry| entry.file_type().is_file() && entry.file_name().to_string_lossy().contains(&marker)))
}

#[tauri::command]
pub async fn remove_download(path: String, download_dir: String) -> Result<(), String> {
    let root = PathBuf::from(download_dir);
    let target = validated_child_path(&root, &PathBuf::from(path))?;
    if !target.is_file() { return Err("Downloaded file no longer exists".to_string()); }
    tokio::fs::remove_file(target).await.map_err(|e| format!("Could not remove download: {e}"))
}

fn quality_value(value: &str) -> &'static str {
    match value {
        "best" => "0",
        "high" => "2",
        "balanced" => "5",
        _ => "5",
    }
}

fn build_download_args(
    strategy: DownloadStrategy,
    output_template: &str,
    ffmpeg: Option<&Path>,
    aria2c: Option<&Path>,
    format: &str,
    quality: &str,
    allow_playlist: bool,
    url: &str,
) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = vec![
        "--newline".into(),
        "--progress".into(),
        "--progress-template".into(),
        "download:VITR:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.title)s".into(),
        "-o".into(),
        output_template.to_string(),
    ];
    if !allow_playlist { args.push("--no-playlist".into()); }
    if let Some(ffmpeg) = ffmpeg {
        args.push("--ffmpeg-location".into());
        args.push(ffmpeg.to_string_lossy().into_owned());
    }

    if strategy == DownloadStrategy::SealFirst {
        args.push("--embed-metadata".into());
        args.push("--embed-thumbnail".into());
        if let Some(aria2c) = aria2c {
            args.push("--external-downloader".into());
            args.push(aria2c.to_string_lossy().into_owned());
        }
    }

    match format {
        "mp3" | "flac" | "wav" => {
            args.extend([
                "-x".into(),
                "--audio-format".into(),
                format.to_string(),
                "--audio-quality".into(),
                quality_value(quality).into(),
            ]);
        }
        "m4a" => {
            args.extend([
                "-f".into(),
                "bestaudio[ext=m4a]/bestaudio".into(),
                "--remux-video".into(),
                "m4a".into(),
            ]);
        }
        _ => return Err("Unsupported audio format".to_string()),
    }
    args.push(url.to_string());
    Ok(args)
}

async fn run_download_attempt(
    app: &AppHandle,
    manager: &DownloadManager,
    task_id: &str,
    ytdlp: &Path,
    args: &[String],
) -> Result<(), DownloadAttemptError> {
    let mut child = runtime::silent_command(ytdlp)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| DownloadAttemptError {
            detail: format!("Could not launch yt-dlp download: {e}"),
            cancelled: false,
        })?;
    let pid = child.id().ok_or_else(|| DownloadAttemptError {
        detail: "Could not track download process".to_string(),
        cancelled: false,
    })?;
    manager.processes.lock()
        .map_err(|_| DownloadAttemptError {
            detail: "Download state is unavailable".to_string(),
            cancelled: false,
        })?
        .insert(task_id.to_string(), pid);

    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill().await;
            let _ = manager.processes.lock().map(|mut processes| processes.remove(task_id));
            return Err(DownloadAttemptError {
                detail: "Download output is unavailable".to_string(),
                cancelled: false,
            });
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            let _ = child.kill().await;
            let _ = manager.processes.lock().map(|mut processes| processes.remove(task_id));
            return Err(DownloadAttemptError {
                detail: "Download error output is unavailable".to_string(),
                cancelled: false,
            });
        }
    };
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut text = String::new();
        while let Ok(Some(line)) = lines.next_line().await {
            if !text.is_empty() { text.push('\n'); }
            text.push_str(&line);
        }
        text
    });

    let mut lines = BufReader::new(stdout).lines();
    while let Some(line) = lines.next_line().await.map_err(|e| DownloadAttemptError {
        detail: format!("Could not read download progress: {e}"),
        cancelled: false,
    })? {
        if let Some(mut progress) = parse_progress(&line) {
            progress.task_id = task_id.to_string();
            let _ = app.emit("download-progress", progress);
        }
    }

    let status = child.wait().await.map_err(|e| DownloadAttemptError {
        detail: format!("Could not wait for download: {e}"),
        cancelled: false,
    })?;
    let stderr_text = stderr_task.await.unwrap_or_default();
    let was_tracked = manager.processes.lock()
        .map_err(|_| DownloadAttemptError {
            detail: "Download state is unavailable".to_string(),
            cancelled: false,
        })?
        .remove(task_id)
        .is_some();
    let cancelled = !was_tracked;
    if cancelled {
        return Err(DownloadAttemptError {
            detail: "Download cancelled".to_string(),
            cancelled: true,
        });
    }
    if status.success() {
        Ok(())
    } else {
        let detail = stderr_text.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("yt-dlp exited with an error");
        Err(DownloadAttemptError {
            detail: detail.to_string(),
            cancelled: false,
        })
    }
}

#[tauri::command]
pub async fn download_track(
    app: AppHandle,
    manager: State<'_, DownloadManager>,
    task_id: String,
    url: String,
    output_dir: String,
    format: String,
    quality: String,
    allow_playlist: bool,
) -> Result<(), String> {
    if !url.starts_with("https://www.youtube.com/") && !url.starts_with("https://youtu.be/") {
        return Err("vitr downloads only accept YouTube track URLs".to_string());
    }
    let output_root = PathBuf::from(output_dir);
    tokio::fs::create_dir_all(&output_root).await.map_err(|e| format!("Could not create download folder: {e}"))?;
    allow_media_directory(&app, &output_root)?;

    let runtime_dir = runtime::runtime_dir(&app)?;
    let ytdlp = runtime::resolve_ytdlp(&runtime_dir)?;
    let ffmpeg = runtime::resolve_ffmpeg(&runtime_dir);
    let aria2c = runtime::resolve_aria2c(&runtime_dir);
    if matches!(format.as_str(), "mp3" | "flac" | "wav" | "m4a") && ffmpeg.is_none() {
        return Err("FFmpeg is required for this format. Install FFmpeg, then use Update runtime dependencies again.".to_string());
    }

    let output_template = output_root.join("%(title).180B [%(id)s].%(ext)s").to_string_lossy().into_owned();
    let mut seal_error: Option<String> = None;
    for strategy in download_strategies() {
        let args = build_download_args(
            strategy,
            &output_template,
            ffmpeg.as_deref(),
            aria2c.as_deref(),
            &format,
            &quality,
            allow_playlist,
            &url,
        )?;
        match run_download_attempt(&app, manager.inner(), &task_id, &ytdlp, &args).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                if error.cancelled {
                    return Err("Download cancelled".to_string());
                }
                if strategy == DownloadStrategy::SealFirst {
                    seal_error = Some(error.detail);
                    continue;
                }
                let primary = seal_error.as_deref().unwrap_or("Seal-first attempt did not complete");
                return Err(format!(
                    "Download failed. Seal-first: {primary}. vitr fallback: {}",
                    error.detail
                ));
            }
        }
    }
    Err("Download failed before a download strategy could complete".to_string())
}

#[tauri::command]
pub fn cancel_download(manager: State<'_, DownloadManager>, task_id: String) -> Result<(), String> {
    let pid = manager.processes.lock().map_err(|_| "Download state is unavailable".to_string())?.remove(&task_id);
    let Some(pid) = pid else { return Ok(()); };
    let mut system = System::new_all();
    system.refresh_all();
    let process = system.process(Pid::from_u32(pid));
    match process {
        Some(process) if process.kill() => Ok(()),
        Some(_) => Err("Could not cancel the download process".to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_progress_line() {
        let p = parse_progress("VITR:42.5%|1.2MiB/s|00:31|Example Song").unwrap();
        assert_eq!(p.percent, 42.5);
        assert_eq!(p.speed, "1.2MiB/s");
        assert_eq!(p.item_title, "Example Song");
    }

    #[test]
    fn rejects_delete_outside_root() {
        let root = tempfile::tempdir().unwrap();
        let outside = root.path().parent().unwrap().join("outside.mp3");
        assert!(validated_child_path(root.path(), &outside).is_err());
    }

    #[test]
    fn Seal_style_strategy_is_first() {
        assert_eq!(
            download_strategies(),
            vec![DownloadStrategy::SealFirst, DownloadStrategy::VitrFallback]
        );
    }

    #[test]
    fn Seal_style_args_add_metadata_thumbnail_and_optional_aria2c() {
        let args = build_download_args(
            DownloadStrategy::SealFirst,
            "track.%(ext)s",
            Some(Path::new("ffmpeg")),
            Some(Path::new("aria2c")),
            "mp3",
            "high",
            false,
            "https://youtu.be/example",
        ).unwrap();
        assert!(args.iter().any(|arg| arg == "--embed-metadata"));
        assert!(args.iter().any(|arg| arg == "--embed-thumbnail"));
        assert!(args.windows(2).any(|pair| pair == ["--external-downloader", "aria2c"]));
    }

    #[test]
    fn fallback_args_preserve_conservative_profile() {
        let args = build_download_args(
            DownloadStrategy::VitrFallback,
            "track.%(ext)s",
            Some(Path::new("ffmpeg")),
            Some(Path::new("aria2c")),
            "mp3",
            "high",
            false,
            "https://youtu.be/example",
        ).unwrap();
        assert!(!args.iter().any(|arg| arg == "--embed-metadata"));
        assert!(!args.iter().any(|arg| arg == "--embed-thumbnail"));
        assert!(!args.iter().any(|arg| arg == "--external-downloader"));
    }
}
