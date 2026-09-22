use regex::Regex;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::{models::{CatalogItem, CatalogMetadata, SearchCatalog, Track}, runtime};

const VITR_USER_AGENT: &str = concat!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 vitr/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Clone)]
struct InnerTubeConfig {
    api_key: String,
    client_name: String,
    client_version: String,
    endpoint: String,
    homepage: String,
}

fn valid_video_id(value: &str) -> bool {
    value.len() == 11 && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn collect_named(node: &Value, key: &str, out: &mut Vec<Value>) {
    match node {
        Value::Object(map) => {
            if let Some(value) = map.get(key) {
                out.push(value.clone());
            }
            for value in map.values() {
                collect_named(value, key, out);
            }
        }
        Value::Array(values) => {
            for value in values {
                collect_named(value, key, out);
            }
        }
        _ => {}
    }
}

fn first_run_text(value: &Value) -> String {
    value
        .get("runs")
        .and_then(Value::as_array)
        .and_then(|runs| runs.first())
        .and_then(|run| run.get("text"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn flex_text(renderer: &Value, index: usize) -> String {
    renderer
        .get("flexColumns")
        .and_then(Value::as_array)
        .and_then(|cols| cols.get(index))
        .and_then(|col| col.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|col| col.get("text"))
        .map(first_run_text)
        .unwrap_or_default()
}

fn first_named_string(node: &Value, key: &str) -> Option<String> {
    match node {
        Value::Object(map) => {
            if let Some(value) = map.get(key).and_then(Value::as_str) {
                if !value.trim().is_empty() { return Some(value.to_string()); }
            }
            map.values().find_map(|value| first_named_string(value, key))
        }
        Value::Array(values) => values.iter().find_map(|value| first_named_string(value, key)),
        _ => None,
    }
}

fn last_thumbnail(value: &Value) -> Option<String> {
    let mut arrays = Vec::new();
    collect_named(value, "thumbnails", &mut arrays);
    arrays
        .into_iter()
        .filter_map(|entry| entry.as_array().cloned())
        .flat_map(|items| items.into_iter())
        .filter_map(|item| item.get("url").and_then(Value::as_str).map(ToOwned::to_owned))
        .last()
}

fn track_from_music_renderer(renderer: &Value) -> Option<Track> {
    let id = renderer.pointer("/playlistItemData/videoId")?.as_str()?.to_string();
    if !valid_video_id(&id) { return None; }
    let title = flex_text(renderer, 0);
    if title.is_empty() { return None; }
    let artist = {
        let value = flex_text(renderer, 1);
        if value.is_empty() { "Unknown artist".to_string() } else { value }
    };
    Some(Track {
        id,
        kind: "youtube".to_string(),
        title,
        artist,
        album: None,
        cover: last_thumbnail(renderer),
        duration_seconds: None,
        source: Some("YouTube Music".to_string()),
        path: None,
    })
}

fn parse_music_results(root: &Value) -> Vec<Track> {
    let mut renderers = Vec::new();
    collect_named(root, "musicResponsiveListItemRenderer", &mut renderers);
    renderers.iter().filter_map(track_from_music_renderer).collect()
}

fn dedupe_catalog(items: Vec<CatalogItem>) -> Vec<CatalogItem> {
    let mut seen = std::collections::HashSet::new();
    items.into_iter().filter(|item| seen.insert(format!("{}:{}", item.kind, item.id))).collect()
}

fn classify_catalog_entity(renderer: &Value) -> Option<(&'static str, f64)> {
    let page_type = first_named_string(renderer, "pageType").unwrap_or_default().to_uppercase();
    let subtitle = {
        let direct = renderer
            .get("subtitle")
            .map(first_run_text)
            .unwrap_or_default();
        if direct.is_empty() { flex_text(renderer, 1) } else { direct }
    }
    .to_lowercase();
    let browse_id = first_named_string(renderer, "browseId").unwrap_or_default();

    if page_type.contains("ARTIST") {
        return Some(("artist", 1.0));
    }
    if page_type.contains("ALBUM") {
        return Some(("album", 1.0));
    }
    if page_type.contains("PLAYLIST") {
        return Some(("playlist", 1.0));
    }
    if page_type.contains("MOOD") || page_type.contains("GENRE") {
        return Some(("genre", 1.0));
    }

    if browse_id.starts_with("UC") || browse_id.starts_with("MPLA") {
        return Some(("artist", 0.92));
    }
    if browse_id.starts_with("MPRE") {
        return Some(("album", 0.92));
    }
    if browse_id.starts_with("VL") || browse_id.starts_with("PL") {
        return Some(("playlist", 0.92));
    }
    if browse_id.contains("moods_and_genres") {
        return Some(("genre", 0.92));
    }

    if subtitle == "artist"
        || subtitle.starts_with("artist ·")
        || subtitle.starts_with("artist •")
    {
        return Some(("artist", 0.84));
    }
    if subtitle.starts_with("album")
        || subtitle.starts_with("single")
        || subtitle == "ep"
        || subtitle.starts_with("ep ·")
        || subtitle.starts_with("ep •")
    {
        return Some(("album", 0.84));
    }
    if subtitle.starts_with("playlist") {
        return Some(("playlist", 0.84));
    }
    if subtitle.contains("genre") || subtitle.contains("mood") {
        return Some(("genre", 0.84));
    }

    None
}

fn catalog_item(renderer: &Value, kind: &str, confidence: f64) -> Option<CatalogItem> {
    let title = {
        let direct = renderer
            .get("title")
            .or_else(|| renderer.get("buttonText"))
            .map(first_run_text)
            .unwrap_or_default();
        if direct.is_empty() { flex_text(renderer, 0) } else { direct }
    };
    if title.is_empty() { return None; }

    let subtitle = {
        let direct = renderer.get("subtitle").map(first_run_text).unwrap_or_default();
        if direct.is_empty() { flex_text(renderer, 1) } else { direct }
    };
    let browse_id = first_named_string(renderer, "browseId");
    let id = browse_id
        .clone()
        .unwrap_or_else(|| format!("{kind}:{title}"));
    let search_query = match kind {
        "artist" => title.clone(),
        "album" => format!("{title} album"),
        "playlist" => format!("{title} playlist"),
        "genre" => format!("{title} music"),
        _ => title.clone(),
    };

    Some(CatalogItem {
        id,
        kind: kind.to_string(),
        title,
        subtitle,
        cover: last_thumbnail(renderer),
        metadata: CatalogMetadata {
            entity_type: kind.to_string(),
            source: "youtube_music".to_string(),
            browse_id,
            search_query,
            confidence,
        },
    })
}

fn parse_music_catalog(root: &Value) -> SearchCatalog {
    let mut catalog = SearchCatalog {
        tracks: parse_music_results(root),
        ..Default::default()
    };
    let mut all_items = Vec::new();

    let mut two_rows = Vec::new();
    collect_named(root, "musicTwoRowItemRenderer", &mut two_rows);
    for renderer in two_rows {
        if let Some((kind, confidence)) = classify_catalog_entity(&renderer) {
            if let Some(item) = catalog_item(&renderer, kind, confidence) {
                all_items.push(item);
            }
        }
    }

    let mut responsive_rows = Vec::new();
    collect_named(root, "musicResponsiveListItemRenderer", &mut responsive_rows);
    for renderer in responsive_rows {
        if renderer.pointer("/playlistItemData/videoId").is_some() {
            continue;
        }
        if let Some((kind, confidence)) = classify_catalog_entity(&renderer) {
            if let Some(item) = catalog_item(&renderer, kind, confidence) {
                all_items.push(item);
            }
        }
    }

    let mut buttons = Vec::new();
    collect_named(root, "musicNavigationButtonRenderer", &mut buttons);
    for renderer in buttons {
        if let Some((kind, confidence)) = classify_catalog_entity(&renderer) {
            if kind == "genre" {
                if let Some(item) = catalog_item(&renderer, kind, confidence) {
                    all_items.push(item);
                }
            }
        }
    }

    catalog.items = dedupe_catalog(all_items);
    catalog.artists = catalog
        .items
        .iter()
        .filter(|item| item.metadata.entity_type == "artist")
        .cloned()
        .collect();
    catalog.albums = catalog
        .items
        .iter()
        .filter(|item| item.metadata.entity_type == "album")
        .cloned()
        .collect();
    catalog.playlists = catalog
        .items
        .iter()
        .filter(|item| item.metadata.entity_type == "playlist")
        .cloned()
        .collect();
    catalog.genres = catalog
        .items
        .iter()
        .filter(|item| item.metadata.entity_type == "genre")
        .cloned()
        .collect();
    catalog
}

fn track_from_web_renderer(renderer: &Value) -> Option<Track> {
    let id = renderer.get("videoId")?.as_str()?.to_string();
    if !valid_video_id(&id) { return None; }
    let title = renderer.get("title").map(first_run_text).unwrap_or_default();
    if title.is_empty() { return None; }
    let artist = renderer
        .get("ownerText")
        .map(first_run_text)
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "Unknown artist".to_string());
    let duration_seconds = renderer
        .get("lengthSeconds")
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<f64>().ok());
    Some(Track {
        id,
        kind: "youtube".to_string(),
        title,
        artist,
        album: None,
        cover: last_thumbnail(renderer),
        duration_seconds,
        source: Some("YouTube".to_string()),
        path: None,
    })
}

fn parse_web_results(root: &Value) -> Vec<Track> {
    let mut renderers = Vec::new();
    collect_named(root, "videoRenderer", &mut renderers);
    renderers.iter().filter_map(track_from_web_renderer).collect()
}

fn client_settings(client: &str) -> Result<(&'static str, &'static str, &'static str), String> {
    match client {
        "music" => Ok(("https://music.youtube.com/", "https://music.youtube.com/youtubei/v1/search", "WEB_REMIX")),
        "web" => Ok(("https://www.youtube.com/", "https://www.youtube.com/youtubei/v1/search", "WEB")),
        _ => Err("Unsupported InnerTube client".to_string()),
    }
}

async fn fetch_innertube_config(client: &str) -> Result<InnerTubeConfig, String> {
    let (homepage, endpoint, client_name) = client_settings(client)?;
    let http = reqwest::Client::builder()
        .user_agent(VITR_USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;
    let html = http
        .get(homepage)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Could not open YouTube provider: {e}"))?
        .error_for_status()
        .map_err(|e| format!("YouTube provider returned an error: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Could not read YouTube provider config: {e}"))?;

    let api_re = Regex::new(r#"\"INNERTUBE_API_KEY\"\s*:\s*\"([^\"]+)\""#).map_err(|e| e.to_string())?;
    let version_re = Regex::new(r#"\"INNERTUBE_CLIENT_VERSION\"\s*:\s*\"([^\"]+)\""#).map_err(|e| e.to_string())?;
    let api_key = api_re
        .captures(&html)
        .and_then(|m| m.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| "YouTube provider config did not include an API key".to_string())?;
    let client_version = version_re
        .captures(&html)
        .and_then(|m| m.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| "YouTube provider config did not include a client version".to_string())?;

    Ok(InnerTubeConfig {
        api_key,
        client_name: client_name.to_string(),
        client_version,
        endpoint: endpoint.to_string(),
        homepage: homepage.to_string(),
    })
}

async fn innertube_search_response(query: &str, client: &str) -> Result<Value, String> {
    let cfg = fetch_innertube_config(client).await?;
    let url = format!("{}?key={}&prettyPrint=false", cfg.endpoint, urlencoding::encode(&cfg.api_key));
    let body = json!({
        "context": {
            "client": {
                "clientName": cfg.client_name,
                "clientVersion": cfg.client_version,
                "hl": "en"
            }
        },
        "query": query
    });
    reqwest::Client::new()
        .post(url)
        .header("User-Agent", VITR_USER_AGENT)
        .header("Referer", &cfg.homepage)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("YouTube search failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("YouTube search failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Could not parse YouTube search results: {e}"))
}

#[tauri::command]
pub async fn innertube_search(query: String, client: String) -> Result<Vec<Track>, String> {
    let query = query.trim();
    if query.is_empty() { return Ok(Vec::new()); }
    let response = innertube_search_response(query, &client).await?;
    Ok(if client == "music" { parse_music_results(&response) } else { parse_web_results(&response) })
}

#[tauri::command]
pub async fn innertube_catalog_search(query: String) -> Result<SearchCatalog, String> {
    let query = query.trim();
    if query.is_empty() { return Ok(SearchCatalog::default()); }
    let response = innertube_search_response(query, "music").await?;
    Ok(parse_music_catalog(&response))
}

#[tauri::command]
pub async fn ytdlp_search(app: AppHandle, query: String) -> Result<Vec<Track>, String> {
    let query = query.trim();
    if query.is_empty() { return Ok(Vec::new()); }
    let runtime_dir = runtime::runtime_dir(&app)?;
    let ytdlp = runtime::resolve_ytdlp(&runtime_dir)?;
    let output = runtime::silent_command(&ytdlp)
        .args(["--no-warnings", "--flat-playlist", "--dump-single-json", &format!("ytsearch20:{query}")])
        .output()
        .await
        .map_err(|e| format!("Could not launch yt-dlp search: {e}"))?;
    if !output.status.success() {
        return Err(format!("yt-dlp search failed: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let root: Value = serde_json::from_slice(&output.stdout).map_err(|e| format!("Could not parse yt-dlp search: {e}"))?;
    let mut tracks = Vec::new();
    for item in root.get("entries").and_then(Value::as_array).into_iter().flatten() {
        let Some(id) = item.get("id").and_then(Value::as_str) else { continue };
        if !valid_video_id(id) { continue; }
        let title = item.get("title").and_then(Value::as_str).unwrap_or("Unknown track").to_string();
        let artist = item.get("channel").or_else(|| item.get("uploader")).and_then(Value::as_str).unwrap_or("Unknown artist").to_string();
        let cover = item.get("thumbnail").and_then(Value::as_str).map(ToOwned::to_owned);
        let duration_seconds = item.get("duration").and_then(Value::as_f64);
        tracks.push(Track {
            id: id.to_string(),
            kind: "youtube".to_string(),
            title,
            artist,
            album: None,
            cover,
            duration_seconds,
            source: Some("YouTube".to_string()),
            path: None,
        });
    }
    Ok(tracks)
}

#[tauri::command]
pub async fn resolve_stream_url(app: AppHandle, video_id: String) -> Result<String, String> {
    if !valid_video_id(&video_id) {
        return Err("Invalid YouTube video id".to_string());
    }
    let runtime_dir = runtime::runtime_dir(&app)?;
    let ytdlp = runtime::resolve_ytdlp(&runtime_dir)?;
    let url = format!("https://www.youtube.com/watch?v={video_id}");
    let output = runtime::silent_command(&ytdlp)
        .args(["--no-warnings", "--no-playlist", "-f", "bestaudio/best", "-g", &url])
        .output()
        .await
        .map_err(|e| format!("Could not launch yt-dlp: {e}"))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("yt-dlp could not resolve this track: {error}"));
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("https://") || line.starts_with("http://"))
        .map(ToOwned::to_owned)
        .ok_or_else(|| "yt-dlp returned no playable audio URL".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_music_track() {
        let json: Value = serde_json::from_str(include_str!("../tests/fixtures/music-search.json")).unwrap();
        let tracks = parse_music_results(&json);
        assert_eq!(tracks[0].id, "abcdefghijk");
        assert_eq!(tracks[0].source.as_deref(), Some("YouTube Music"));
    }

    #[test]
    fn parses_web_track() {
        let json: Value = serde_json::from_str(include_str!("../tests/fixtures/web-search.json")).unwrap();
        let tracks = parse_web_results(&json);
        assert_eq!(tracks[0].source.as_deref(), Some("YouTube"));
    }

    #[test]
    fn parses_catalog_entities() {
        let json = json!({
            "items": [
                { "musicTwoRowItemRenderer": {
                    "title": { "runs": [{ "text": "Example Artist" }] },
                    "subtitle": { "runs": [{ "text": "Artist" }] },
                    "navigationEndpoint": { "browseEndpoint": {
                        "browseId": "UCartist",
                        "browseEndpointContextSupportedConfigs": {
                            "browseEndpointContextMusicConfig": { "pageType": "MUSIC_PAGE_TYPE_ARTIST" }
                        }
                    }}
                }},
                { "musicTwoRowItemRenderer": {
                    "title": { "runs": [{ "text": "Example Album" }] },
                    "subtitle": { "runs": [{ "text": "Album · Example Artist" }] },
                    "navigationEndpoint": { "browseEndpoint": {
                        "browseId": "MPREalbum",
                        "browseEndpointContextSupportedConfigs": {
                            "browseEndpointContextMusicConfig": { "pageType": "MUSIC_PAGE_TYPE_ALBUM" }
                        }
                    }}
                }},
                { "musicTwoRowItemRenderer": {
                    "title": { "runs": [{ "text": "Example Playlist" }] },
                    "subtitle": { "runs": [{ "text": "Playlist" }] },
                    "navigationEndpoint": { "browseEndpoint": {
                        "browseId": "VLPLplaylist",
                        "browseEndpointContextSupportedConfigs": {
                            "browseEndpointContextMusicConfig": { "pageType": "MUSIC_PAGE_TYPE_PLAYLIST" }
                        }
                    }}
                }}
            ]
        });
        let catalog = parse_music_catalog(&json);
        assert_eq!(catalog.artists[0].title, "Example Artist");
        assert_eq!(catalog.artists[0].metadata.entity_type, "artist");
        assert_eq!(catalog.albums[0].title, "Example Album");
        assert_eq!(catalog.albums[0].metadata.entity_type, "album");
        assert_eq!(catalog.playlists[0].title, "Example Playlist");
        assert_eq!(catalog.playlists[0].metadata.entity_type, "playlist");
        assert_eq!(catalog.items.len(), 3);
    }

    #[test]
    fn parses_responsive_artist_metadata() {
        let json = json!({
            "items": [{
                "musicResponsiveListItemRenderer": {
                    "flexColumns": [
                        {
                            "musicResponsiveListItemFlexColumnRenderer": {
                                "text": { "runs": [{ "text": "Metadata Artist" }] }
                            }
                        },
                        {
                            "musicResponsiveListItemFlexColumnRenderer": {
                                "text": { "runs": [{ "text": "Artist" }] }
                            }
                        }
                    ],
                    "navigationEndpoint": {
                        "browseEndpoint": {
                            "browseId": "UCmetadataartist",
                            "browseEndpointContextSupportedConfigs": {
                                "browseEndpointContextMusicConfig": {
                                    "pageType": "MUSIC_PAGE_TYPE_ARTIST"
                                }
                            }
                        }
                    }
                }
            }]
        });
        let catalog = parse_music_catalog(&json);
        assert_eq!(catalog.artists.len(), 1);
        assert_eq!(catalog.artists[0].metadata.entity_type, "artist");
        assert_eq!(catalog.artists[0].metadata.source, "youtube_music");
        assert_eq!(catalog.artists[0].metadata.browse_id.as_deref(), Some("UCmetadataartist"));
        assert_eq!(catalog.artists[0].metadata.search_query, "Metadata Artist");
    }

    #[test]
    fn rejects_invalid_video_ids() {
        assert!(valid_video_id("abcdefghijk"));
        assert!(!valid_video_id("too-short"));
        assert!(!valid_video_id("bad id!!!!!"));
    }
}
