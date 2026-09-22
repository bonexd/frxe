mod downloads;
mod lyrics;
mod media_controls;
mod models;
mod runtime;
mod search;
mod sync;
mod tray;
mod updates;

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

fn mini_dimensions(mode: &str) -> (f64, f64, bool) {
    match mode {
        "lyrics" => (250.0, 250.0, true),
        _ => (356.0, 88.0, false),
    }
}

fn dock_mini(window: &WebviewWindow, side: &str) -> Result<(), String> {
    let Some(monitor) = window
        .current_monitor()
        .map_err(|error| format!("Could not read monitor: {error}"))?
    else {
        return Ok(());
    };

    let scale = monitor.scale_factor();
    let monitor_position = monitor.position().to_logical::<f64>(scale);
    let monitor_size = monitor.size().to_logical::<f64>(scale);
    let window_size = window
        .outer_size()
        .map_err(|error| format!("Could not read mini player size: {error}"))?
        .to_logical::<f64>(scale);

    let edge = 18.0;
    let taskbar_gap = 62.0;
    let x = if side == "left" {
        monitor_position.x + edge
    } else {
        monitor_position.x + monitor_size.width - window_size.width - edge
    };
    let y = monitor_position.y + monitor_size.height - window_size.height - taskbar_gap;

    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| format!("Could not dock mini player: {error}"))
}

fn clamp_mini_position(window: &WebviewWindow, x: f64, y: f64) -> Result<(f64, f64), String> {
    let Some(monitor) = window
        .current_monitor()
        .map_err(|error| format!("Could not read monitor: {error}"))?
    else {
        return Ok((x, y));
    };

    let scale = monitor.scale_factor();
    let monitor_position = monitor.position().to_logical::<f64>(scale);
    let monitor_size = monitor.size().to_logical::<f64>(scale);
    let window_size = window
        .outer_size()
        .map_err(|error| format!("Could not read mini player size: {error}"))?
        .to_logical::<f64>(scale);

    let edge = 8.0;
    let min_x = monitor_position.x + edge;
    let min_y = monitor_position.y + edge;
    let max_x = monitor_position.x + monitor_size.width - window_size.width - edge;
    let max_y = monitor_position.y + monitor_size.height - window_size.height - edge;

    Ok((x.clamp(min_x, max_x.max(min_x)), y.clamp(min_y, max_y.max(min_y))))
}

#[tauri::command]
fn toggle_mini_player(app: AppHandle, mode: String, _dock: String) -> Result<(), String> {
    let (width, height, resizable) = mini_dimensions(&mode);

    let Some(window) = app.get_webview_window("mini") else {
        return Err("Mini player window is unavailable".to_string());
    };

    let is_visible = window
        .is_visible()
        .map_err(|error| format!("Could not read mini player visibility: {error}"))?;

    if is_visible {
        window
            .hide()
            .map_err(|error| format!("Could not hide mini player: {error}"))?;
        return Ok(());
    }

    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| format!("Could not resize mini player: {error}"))?;
    window
        .set_resizable(resizable)
        .map_err(|error| format!("Could not update mini player resize mode: {error}"))?;
    window
        .set_always_on_top(true)
        .map_err(|error| format!("Could not pin mini player: {error}"))?;
    window
        .show()
        .map_err(|error| format!("Could not show mini player: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("Could not focus mini player: {error}"))?;

    dock_mini(&window, "right")?;
    Ok(())
}

#[tauri::command]
fn set_mini_mode(window: WebviewWindow, mode: String) -> Result<(), String> {
    let (width, height, resizable) = mini_dimensions(&mode);
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| format!("Could not resize mini player: {error}"))?;
    window
        .set_resizable(resizable)
        .map_err(|error| format!("Could not update resize mode: {error}"))?;

    dock_mini(&window, "right")
}

#[tauri::command]
fn start_mini_drag(window: WebviewWindow) -> Result<(), String> {
    window
        .start_dragging()
        .map_err(|error| format!("Could not drag mini player: {error}"))
}

#[tauri::command]
fn mini_position(window: WebviewWindow) -> Result<(f64, f64), String> {
    let position = window
        .outer_position()
        .map_err(|error| format!("Could not read mini player position: {error}"))?;
    let scale = window
        .scale_factor()
        .map_err(|error| format!("Could not read scale factor: {error}"))?;
    let logical = position.to_logical::<f64>(scale);
    Ok((logical.x, logical.y))
}

#[tauri::command]
fn set_mini_position(window: WebviewWindow, x: f64, y: f64) -> Result<(), String> {
    let (x, y) = clamp_mini_position(&window, x, y)?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| format!("Could not restore mini player position: {error}"))
}

#[tauri::command]
fn set_mini_always_on_top(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|error| format!("Could not update always-on-top: {error}"))
}

#[tauri::command]
fn dock_mini_player(window: WebviewWindow, side: String) -> Result<(), String> {
    dock_mini(&window, if side == "left" { "left" } else { "right" })
}

#[tauri::command]
fn hide_mini_player(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        if !main.is_visible().unwrap_or(true) {
            let _ = main.show();
            let _ = main.set_focus();
        }
    }
    window
        .hide()
        .map_err(|error| format!("Could not hide mini player: {error}"))
}

#[tauri::command]
async fn choose_audio_download_dir(app: AppHandle) -> Result<Option<String>, String> {
    let selected = app.dialog().file().blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|error| format!("Could not read selected folder: {error}"))?;
    std::fs::create_dir_all(&path)
        .map_err(|error| format!("Could not create selected audio folder: {error}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Main vitr window is unavailable".to_string());
    };
    window
        .show()
        .map_err(|error| format!("Could not show vitr: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("Could not focus vitr: {error}"))
}

#[tauri::command]
fn set_mini_player_enabled(app: AppHandle, enabled: bool, layout: String) -> Result<(), String> {
    let mode = if layout == "lyrics" {
        "lyrics"
    } else {
        "standard"
    };
    let Some(window) = app.get_webview_window("mini") else {
        return Err("Mini player window is unavailable".to_string());
    };
    if !enabled {
        return window
            .hide()
            .map_err(|error| format!("Could not hide mini player: {error}"));
    }

    let (width, height, resizable) = mini_dimensions(mode);
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| format!("Could not resize mini player: {error}"))?;
    window
        .set_resizable(resizable)
        .map_err(|error| format!("Could not update mini player resize mode: {error}"))?;
    window
        .set_always_on_top(true)
        .map_err(|error| format!("Could not pin mini player: {error}"))?;
    window
        .show()
        .map_err(|error| format!("Could not show mini player: {error}"))?;
    dock_mini(&window, "right")?;
    Ok(())
}

#[tauri::command]
fn mini_player_action(app: AppHandle, action: String) -> Result<(), String> {
    let Some(main) = app.get_webview_window("main") else {
        return Err("Main vitr window is unavailable".to_string());
    };
    let action_json = serde_json::to_string(&action)
        .map_err(|error| format!("Could not encode player action: {error}"))?;
    main.eval(&format!(
        "window.vitrPlayerAction&&window.vitrPlayerAction({action_json});"
    ))
    .map_err(|error| format!("Could not control Vitr player: {error}"))
}

#[tauri::command]
fn mini_player_volume(app: AppHandle, delta: f64) -> Result<(), String> {
    let Some(main) = app.get_webview_window("main") else {
        return Err("Main vitr window is unavailable".to_string());
    };
    let safe_delta = delta.clamp(-1.0, 1.0);
    main.eval(&format!(
        "window.vitrPlayerAdjustVolume&&window.vitrPlayerAdjustVolume({safe_delta});"
    ))
    .map_err(|error| format!("Could not change Vitr volume: {error}"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(downloads::DownloadManager::default())
        .manage(sync::DownloadSyncManager::default())
        .setup(|app| {
            if let Err(error) = tray::install(app) {
                eprintln!("vitr system tray unavailable: {error}");
            }
            if let Err(error) = media_controls::install(app) {
                eprintln!("vitr native media controls unavailable: {error}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if let Some(mini) = app.get_webview_window("mini") {
                    if mini.is_visible().unwrap_or(false) {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        let _ = mini.close();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            search::innertube_search,
            search::innertube_catalog_search,
            search::ytdlp_search,
            search::resolve_stream_url,
            downloads::authorize_media_path,
            downloads::default_download_dir,
            downloads::scan_downloads,
            downloads::clear_removed_downloads,
            downloads::download_already_exists,
            downloads::download_track,
            downloads::cancel_download,
            downloads::remove_download,
            lyrics::fetch_metadata_lyrics,
            runtime::update_runtime_dependencies,
            runtime::current_runtime_status,
            updates::check_client_update,
            updates::open_release_page,
            sync::start_download_sync,
            sync::download_sync_status,
            sync::sync_downloads_from_peer,
            choose_audio_download_dir,
            tray::set_tray_enabled,
            media_controls::update_media_controls,
            toggle_mini_player,
            set_mini_mode,
            start_mini_drag,
            mini_position,
            set_mini_position,
            set_mini_always_on_top,
            dock_mini_player,
            hide_mini_player,
            show_main_window,
            set_mini_player_enabled,
            mini_player_action,
            mini_player_volume
        ])
        .run(tauri::generate_context!())
        .expect("vitr failed to start");
}
