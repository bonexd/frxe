use serde_json::Value;

use crate::models::ClientUpdateStatus;

const RELEASES_API: &str = "https://api.github.com/repos/bloodvitr/vitr/releases/latest";
const RELEASES_PAGE: &str = "https://github.com/bloodvitr/vitr/releases";

fn version_parts(value: &str) -> Vec<u64> {
    value
        .trim()
        .trim_start_matches('v')
        .split(|c| c == '.' || c == '-' || c == '+')
        .take(3)
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .chain(std::iter::repeat(0))
        .take(3)
        .collect()
}

fn is_newer(latest: &str, current: &str) -> bool {
    version_parts(latest) > version_parts(current)
}

#[tauri::command]
pub async fn check_client_update() -> Result<ClientUpdateStatus, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let response = reqwest::Client::builder()
        .user_agent(concat!("vitr/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("Could not initialize update checker: {e}"))?
        .get(RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("Could not check Vitr releases: {e}"))?;

    if response.status().as_u16() == 404 {
        return Ok(ClientUpdateStatus {
            current_version: current.clone(),
            latest_version: current,
            update_available: false,
            release_url: RELEASES_PAGE.to_string(),
            notes: "No published Vitr release is available yet.".to_string(),
        });
    }

    let response = response
        .error_for_status()
        .map_err(|e| format!("Vitr releases returned an error: {e}"))?;
    let value: Value = response
        .json()
        .await
        .map_err(|e| format!("Could not read Vitr release metadata: {e}"))?;

    let latest = value
        .get("tag_name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();
    let release_url = value
        .get("html_url")
        .and_then(Value::as_str)
        .unwrap_or(RELEASES_PAGE)
        .to_string();
    let notes = value
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    Ok(ClientUpdateStatus {
        current_version: current.clone(),
        latest_version: if latest.is_empty() { current.clone() } else { latest.clone() },
        update_available: !latest.is_empty() && is_newer(&latest, &current),
        release_url,
        notes,
    })
}

#[tauri::command]
pub fn open_release_page(url: Option<String>) -> Result<(), String> {
    let url = url
        .filter(|value| value.starts_with("https://github.com/bloodvitr/vitr/"))
        .unwrap_or_else(|| RELEASES_PAGE.to_string());

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Could not open Vitr releases: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Could not open Vitr releases: {e}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Could not open Vitr releases: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions() {
        assert!(is_newer("0.3.0", "0.2.3"));
        assert!(!is_newer("0.2.3", "0.2.3"));
        assert!(!is_newer("0.2.2", "0.2.3"));
    }
}
