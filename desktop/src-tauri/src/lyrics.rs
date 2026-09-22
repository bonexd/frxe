use crate::models::LyricsResult;

fn parse_lrclib(raw: &str) -> Result<LyricsResult, String> {
    serde_json::from_str(raw).map_err(|e| format!("Could not parse lyrics response: {e}"))
}

#[tauri::command]
pub async fn fetch_metadata_lyrics(
    title: String,
    artist: String,
    album: String,
    duration_seconds: f64,
) -> Result<LyricsResult, String> {
    let title = title.trim();
    let artist = artist.trim();
    if title.is_empty() || artist.is_empty() {
        return Ok(LyricsResult::default());
    }

    let mut params = vec![
        ("track_name".to_string(), title.to_string()),
        ("artist_name".to_string(), artist.to_string()),
    ];
    if !album.trim().is_empty() {
        params.push(("album_name".to_string(), album.trim().to_string()));
    }
    if duration_seconds.is_finite() && duration_seconds > 0.0 {
        params.push(("duration".to_string(), duration_seconds.round().to_string()));
    }

    let response = reqwest::Client::new()
        .get("https://lrclib.net/api/get")
        .header("User-Agent", "vitr/0.1.0")
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("Lyrics request failed: {e}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(LyricsResult::default());
    }
    let response = response
        .error_for_status()
        .map_err(|e| format!("Lyrics provider returned an error: {e}"))?;
    let raw = response.text().await.map_err(|e| format!("Could not read lyrics response: {e}"))?;
    parse_lrclib(&raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_lrclib_payload() {
        let raw = r#"{"syncedLyrics":"[00:01.00]Hi","plainLyrics":"Hi"}"#;
        let result = parse_lrclib(raw).unwrap();
        assert_eq!(result.synced_lyrics.as_deref(), Some("[00:01.00]Hi"));
        assert_eq!(result.plain_lyrics.as_deref(), Some("Hi"));
    }
}
