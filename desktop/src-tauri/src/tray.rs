use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn install(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let mut builder = TrayIconBuilder::with_id("vitr-tray").tooltip("vitr");
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let tray = builder
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::Click { .. }) {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    tray.set_visible(false)?;
    Ok(())
}

#[tauri::command]
pub fn set_tray_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let tray = app
        .tray_by_id("vitr-tray")
        .ok_or_else(|| "vitr tray is unavailable".to_string())?;
    tray.set_visible(enabled).map_err(|e| e.to_string())
}
