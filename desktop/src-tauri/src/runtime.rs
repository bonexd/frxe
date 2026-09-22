use std::{
    env,
    ffi::OsStr,
    path::{Path, PathBuf},
    process,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tokio::process::Command;

use crate::models::RuntimeStatus;

pub fn silent_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000);
    }
    command
}

pub fn ytdlp_asset_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "yt-dlp_macos"
    } else {
        "yt-dlp_linux"
    }
}

pub fn ytdlp_download_url() -> String {
    format!(
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}",
        ytdlp_asset_name()
    )
}

fn executable_in_path(name: &str) -> Option<PathBuf> {
    env::var_os("PATH")
        .into_iter()
        .flat_map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

pub fn runtime_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not locate vitr app data: {e}"))?
        .join("runtime");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create vitr runtime folder: {e}"))?;
    Ok(dir)
}

pub fn resolve_ytdlp(dir: &Path) -> Result<PathBuf, String> {
    let local = dir.join(ytdlp_asset_name());
    if local.is_file() {
        return Ok(local);
    }
    let path_name = if cfg!(target_os = "windows") { "yt-dlp.exe" } else { "yt-dlp" };
    executable_in_path(path_name)
        .ok_or_else(|| "yt-dlp is unavailable. Open Settings and use Update yt-dlp first.".to_string())
}

pub fn resolve_ffmpeg(dir: &Path) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" };
    let local = dir.join(name);
    if local.is_file() { Some(local) } else { executable_in_path(name) }
}

pub fn resolve_aria2c(dir: &Path) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") { "aria2c.exe" } else { "aria2c" };
    let local = dir.join(name);
    if local.is_file() { Some(local) } else { executable_in_path(name) }
}

pub fn resolve_deno(dir: &Path) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") { "deno.exe" } else { "deno" };
    let local = dir.join(name);
    if local.is_file() { Some(local) } else { executable_in_path(name) }
}

async fn first_version_line(path: &Path, args: &[&str]) -> Option<String> {
    let output = silent_command(path).args(args).output().await.ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}

fn staged_runtime_path(dir: &Path, stage: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    dir.join(format!(
        ".{}.{}-{}-{nonce}",
        ytdlp_asset_name(),
        stage,
        process::id()
    ))
}

async fn validate_ytdlp(path: &Path) -> Result<String, String> {
    let output = silent_command(path)
        .arg("--version")
        .output()
        .await
        .map_err(|e| format!("Downloaded yt-dlp failed validation: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "Downloaded yt-dlp failed validation: version command exited with {}",
            output.status
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| "Downloaded yt-dlp failed validation: version output was empty".to_string())?;

    Ok(version)
}

async fn activate_ytdlp_candidate(
    download_candidate: &Path,
    target: &Path,
    backup: &Path,
) -> Result<(), String> {
    let had_target = target.is_file();

    if backup.exists() {
        tokio::fs::remove_file(backup)
            .await
            .map_err(|e| format!("Could not activate yt-dlp update: could not clear stale backup: {e}"))?;
    }

    if had_target {
        tokio::fs::rename(target, backup)
            .await
            .map_err(|e| format!("Could not activate yt-dlp update: could not preserve current binary: {e}"))?;
    }

    if let Err(error) = tokio::fs::rename(download_candidate, target).await {
        if had_target {
            let _ = tokio::fs::rename(backup, target).await;
        }
        return Err(format!("Could not activate yt-dlp update: {error}"));
    }

    if had_target {
        let _ = tokio::fs::remove_file(backup).await;
    }

    Ok(())
}

async fn status_for_dir(dir: &Path) -> RuntimeStatus {
    let ytdlp = resolve_ytdlp(dir).ok();
    let deno = resolve_deno(dir);
    let ffmpeg = resolve_ffmpeg(dir);
    let mut warnings = Vec::new();
    if deno.is_none() {
        warnings.push("Deno was not found. yt-dlp can still work, but some YouTube extraction paths may be less compatible.".to_string());
    }
    if ffmpeg.is_none() {
        warnings.push("FFmpeg was not found. MP3, FLAC, WAV and M4A conversion/remux require FFmpeg.".to_string());
    }

    RuntimeStatus {
        yt_dlp_version: match ytdlp.as_deref() {
            Some(path) => first_version_line(path, &["--version"]).await,
            None => None,
        },
        deno_version: match deno.as_deref() {
            Some(path) => first_version_line(path, &["--version"]).await,
            None => None,
        },
        ffmpeg_version: match ffmpeg.as_deref() {
            Some(path) => first_version_line(path, &["-version"]).await,
            None => None,
        },
        yt_dlp_path: ytdlp.map(|p| p.to_string_lossy().into_owned()),
        deno_path: deno.map(|p| p.to_string_lossy().into_owned()),
        ffmpeg_path: ffmpeg.map(|p| p.to_string_lossy().into_owned()),
        warnings,
    }
}

#[tauri::command]
pub async fn update_runtime_dependencies(app: tauri::AppHandle) -> Result<RuntimeStatus, String> {
    let dir = runtime_dir(&app)?;
    let target = dir.join(ytdlp_asset_name());
    let download_candidate = staged_runtime_path(&dir, "download-candidate");
    let backup = staged_runtime_path(&dir, "backup");

    let response = reqwest::Client::new()
        .get(ytdlp_download_url())
        .header("User-Agent", concat!("vitr/", env!("CARGO_PKG_VERSION")) )
        .send()
        .await
        .map_err(|e| format!("Could not download yt-dlp: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Could not download yt-dlp: {e}"))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Could not download yt-dlp: could not read response: {e}"))?;

    tokio::fs::write(&download_candidate, bytes)
        .await
        .map_err(|e| format!("Could not write yt-dlp update: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&download_candidate, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Could not write yt-dlp update: could not make candidate executable: {e}"))?;
    }

    if let Err(error) = validate_ytdlp(&download_candidate).await {
        let _ = tokio::fs::remove_file(&download_candidate).await;
        return Err(error);
    }

    if let Err(error) = activate_ytdlp_candidate(&download_candidate, &target, &backup).await {
        let _ = tokio::fs::remove_file(&download_candidate).await;
        return Err(error);
    }

    Ok(status_for_dir(&dir).await)
}

#[tauri::command]
pub async fn current_runtime_status(app: tauri::AppHandle) -> Result<RuntimeStatus, String> {
    let dir = runtime_dir(&app)?;
    Ok(status_for_dir(&dir).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ytdlp_asset_matches_platform() {
        let expected = if cfg!(target_os = "windows") {
            "yt-dlp.exe"
        } else if cfg!(target_os = "macos") {
            "yt-dlp_macos"
        } else {
            "yt-dlp_linux"
        };
        assert_eq!(ytdlp_asset_name(), expected);
    }

    #[test]
    fn ytdlp_url_is_official_release_asset() {
        assert_eq!(
            ytdlp_download_url(),
            format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}", ytdlp_asset_name())
        );
    }

    #[test]
    fn staged_runtime_paths_are_unique_and_hidden() {
        let dir = Path::new("runtime-test");
        let first = staged_runtime_path(dir, "download-candidate");
        let second = staged_runtime_path(dir, "backup");
        assert_ne!(first, second);
        assert!(first.file_name().unwrap().to_string_lossy().starts_with('.'));
        assert!(first.file_name().unwrap().to_string_lossy().contains(ytdlp_asset_name()));
        assert!(second.file_name().unwrap().to_string_lossy().contains("backup"));
    }
}
