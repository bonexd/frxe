use playwire::{Capabilities, Event, MediaControls, PlaybackState, PlayerConfig, Repeat, Track};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{sync::Mutex, time::Duration};
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPlaybackSnapshot {
    pub track_id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub artwork: String,
    pub duration_seconds: Option<f64>,
    pub position_seconds: f64,
    pub playing: bool,
    pub volume: f64,
    pub shuffle: bool,
    pub repeat: String,
    pub can_next: bool,
    pub can_previous: bool,
    pub can_seek: bool,
}

pub struct MediaControlsManager {
    controls: Mutex<Option<MediaControls>>,
}

fn finite_non_negative(value: f64) -> f64 {
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

fn repeat_mode(value: &str) -> Repeat {
    match value {
        "track" => Repeat::One,
        "queue" => Repeat::All,
        _ => Repeat::Off,
    }
}

pub fn snapshot_to_playwire(snapshot: &MediaPlaybackSnapshot) -> PlaybackState {
    let duration_seconds = snapshot
        .duration_seconds
        .filter(|value| value.is_finite() && *value > 0.0);
    let duration = duration_seconds.map(Duration::from_secs_f64);
    let mut position_seconds = finite_non_negative(snapshot.position_seconds);
    if let Some(maximum) = duration_seconds {
        position_seconds = position_seconds.min(maximum);
    }

    let track = snapshot.track_id.as_ref().map(|id| Track {
        id: id.clone(),
        title: snapshot.title.clone().unwrap_or_default(),
        artists: snapshot
            .artist
            .clone()
            .filter(|artist| !artist.is_empty())
            .into_iter()
            .collect(),
        album: snapshot.album.clone().unwrap_or_default(),
        artwork_url: snapshot.artwork.clone(),
        url: String::new(),
    });
    let has_track = track.is_some();

    PlaybackState {
        track,
        playing: has_track && snapshot.playing,
        position: Duration::from_secs_f64(position_seconds),
        duration,
        volume: if snapshot.volume.is_finite() {
            snapshot.volume.clamp(0.0, 1.0)
        } else {
            0.0
        },
        repeat: repeat_mode(&snapshot.repeat),
        shuffle: snapshot.shuffle,
        capabilities: Capabilities {
            can_go_next: has_track && snapshot.can_next,
            can_go_previous: has_track && snapshot.can_previous,
            can_seek: has_track && snapshot.can_seek,
        },
    }
}

pub fn event_payload(event: Event) -> Option<Value> {
    match event {
        Event::Play => Some(json!({ "action": "play" })),
        Event::Pause => Some(json!({ "action": "pause" })),
        Event::PlayPause => Some(json!({ "action": "toggle-play" })),
        Event::Stop => Some(json!({ "action": "stop" })),
        Event::Next => Some(json!({ "action": "next" })),
        Event::Previous => Some(json!({ "action": "previous" })),
        Event::SeekTo(position) => Some(json!({
            "action": "seek-to",
            "positionSeconds": position.as_secs_f64()
        })),
        Event::SeekBy(offset) => Some(json!({
            "action": "seek-by",
            "offsetSeconds": offset
        })),
        Event::SetVolume(volume) => Some(json!({
            "action": "set-volume",
            "volume": volume
        })),
        Event::SetShuffle(enabled) => Some(json!({
            "action": "set-shuffle",
            "enabled": enabled
        })),
        Event::SetRepeat(mode) => Some(json!({
            "action": "set-repeat",
            "mode": match mode {
                Repeat::One => "track",
                Repeat::All => "queue",
                Repeat::Off => "off",
            }
        })),
        Event::OpenUri(_) => None,
        Event::Raise => Some(json!({ "action": "raise" })),
        Event::Quit => Some(json!({ "action": "quit" })),
        _ => None,
    }
}

pub fn install(app: &tauri::App) -> Result<(), String> {
    let mut config = PlayerConfig::new("vitr")
        .desktop_entry("app.vitr.desktop")
        .track_id_prefix("/app/vitr/desktop/track");

    #[cfg(windows)]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "vitr main window is unavailable".to_string())?;
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        config = config.hwnd(hwnd.0 as usize as u64);
    }

    let app_handle = app.handle().clone();
    let controls = MediaControls::new(config, move |event| {
        match event {
            Event::Raise => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            Event::Quit => app_handle.exit(0),
            Event::OpenUri(_) => {}
            other => {
                if let Some(payload) = event_payload(other) {
                    let _ = app_handle.emit("player-command", payload);
                }
            }
        }
    });

    match controls {
        Ok(controls) => {
            app.manage(MediaControlsManager {
                controls: Mutex::new(Some(controls)),
            });
            Ok(())
        }
        Err(error) => {
            app.manage(MediaControlsManager {
                controls: Mutex::new(None),
            });
            Err(error.to_string())
        }
    }
}

#[tauri::command]
pub fn update_media_controls(
    state: tauri::State<'_, MediaControlsManager>,
    snapshot: MediaPlaybackSnapshot,
) -> Result<(), String> {
    let mut controls = state
        .controls
        .lock()
        .map_err(|_| "vitr native media controls are unavailable".to_string())?;
    if let Some(controls) = controls.as_mut() {
        controls
            .set_state(&snapshot_to_playwire(&snapshot))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use playwire::{Event, Repeat};
    use serde_json::json;
    use std::time::Duration;

    fn snapshot() -> MediaPlaybackSnapshot {
        MediaPlaybackSnapshot {
            track_id: Some("track-1".to_string()),
            title: Some("Song".to_string()),
            artist: Some("Artist".to_string()),
            album: Some("Album".to_string()),
            artwork: "https://img.test/cover.jpg".to_string(),
            duration_seconds: Some(100.0),
            position_seconds: 42.0,
            playing: true,
            volume: 0.75,
            shuffle: true,
            repeat: "queue".to_string(),
            can_next: true,
            can_previous: false,
            can_seek: true,
        }
    }

    #[test]
    fn maps_snapshot_to_playwire_state() {
        let state = snapshot_to_playwire(&snapshot());
        let track = state.track.expect("track metadata");
        assert_eq!(track.id, "track-1");
        assert_eq!(track.title, "Song");
        assert_eq!(track.artists, vec!["Artist"]);
        assert_eq!(track.album, "Album");
        assert_eq!(track.artwork_url, "https://img.test/cover.jpg");
        assert_eq!(state.position, Duration::from_secs(42));
        assert_eq!(state.duration, Some(Duration::from_secs(100)));
        assert_eq!(state.volume, 0.75);
        assert_eq!(state.repeat, Repeat::All);
        assert!(state.shuffle);
        assert!(state.capabilities.can_go_next);
        assert!(!state.capabilities.can_go_previous);
        assert!(state.capabilities.can_seek);
    }

    #[test]
    fn clamps_position_and_volume() {
        let mut input = snapshot();
        input.duration_seconds = Some(100.0);
        input.position_seconds = 150.0;
        input.volume = 2.0;
        let state = snapshot_to_playwire(&input);
        assert_eq!(state.position, Duration::from_secs(100));
        assert_eq!(state.volume, 1.0);
    }

    #[test]
    fn maps_native_events_to_player_commands() {
        assert_eq!(event_payload(Event::Play), Some(json!({ "action": "play" })));
        assert_eq!(event_payload(Event::Pause), Some(json!({ "action": "pause" })));
        assert_eq!(event_payload(Event::PlayPause), Some(json!({ "action": "toggle-play" })));
        assert_eq!(event_payload(Event::Next), Some(json!({ "action": "next" })));
        assert_eq!(event_payload(Event::Previous), Some(json!({ "action": "previous" })));
        assert_eq!(event_payload(Event::Stop), Some(json!({ "action": "stop" })));
        assert_eq!(
            event_payload(Event::SeekTo(Duration::from_secs(25))),
            Some(json!({ "action": "seek-to", "positionSeconds": 25.0 }))
        );
        assert_eq!(
            event_payload(Event::SeekBy(-10.0)),
            Some(json!({ "action": "seek-by", "offsetSeconds": -10.0 }))
        );
        assert_eq!(
            event_payload(Event::SetVolume(0.4)),
            Some(json!({ "action": "set-volume", "volume": 0.4 }))
        );
        assert_eq!(
            event_payload(Event::SetShuffle(true)),
            Some(json!({ "action": "set-shuffle", "enabled": true }))
        );
        assert_eq!(
            event_payload(Event::SetRepeat(Repeat::One)),
            Some(json!({ "action": "set-repeat", "mode": "track" }))
        );
        assert_eq!(
            event_payload(Event::SetRepeat(Repeat::All)),
            Some(json!({ "action": "set-repeat", "mode": "queue" }))
        );
        assert_eq!(
            event_payload(Event::SetRepeat(Repeat::Off)),
            Some(json!({ "action": "set-repeat", "mode": "off" }))
        );
        assert_eq!(event_payload(Event::OpenUri("https://example.test".to_string())), None);
    }

    #[test]
    fn empty_snapshot_clears_track() {
        let mut input = snapshot();
        input.track_id = None;
        input.playing = true;
        let state = snapshot_to_playwire(&input);
        assert!(state.track.is_none());
        assert!(!state.playing);
    }
}
