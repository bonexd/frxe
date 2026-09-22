use std::{
    collections::HashMap,
    fs::{self, File},
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use walkdir::WalkDir;

const SERVICE_TYPE: &str = "_vitr-sync._tcp.local.";
const PROTOCOL_VERSION: u64 = 1;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPeer {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub transport: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub sharing: bool,
    pub pair_code: String,
    pub peers: Vec<SyncPeer>,
    pub status: String,
}

#[derive(Clone)]
struct SyncRuntime {
    pair_code: String,
    download_dir: Arc<Mutex<PathBuf>>,
    peers: Arc<Mutex<HashMap<String, SyncPeer>>>,
    _mdns: ServiceDaemon,
    service_fullname: String,
}

#[derive(Default)]
pub struct DownloadSyncManager {
    runtime: Mutex<Option<SyncRuntime>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteItem {
    id: String,
    title: String,
    artist: String,
    format: String,
    quality: String,
    source_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalItem {
    id: String,
    title: String,
    artist: String,
    format: String,
    quality: String,
    source_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPullResult {
    pub received: u32,
    pub skipped: u32,
}

fn audio_extension(path: &Path) -> Option<String> {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())?
        .to_ascii_lowercase();

    matches!(ext.as_str(), "mp3" | "m4a" | "flac" | "wav")
        .then_some(ext)
}

fn scan_items(root: &Path) -> Vec<LocalItem> {
    if !root.is_dir() {
        return Vec::new();
    }

    let mut items = Vec::new();

    for entry in WalkDir::new(root)
        .max_depth(2)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let Some(format) = audio_extension(path) else {
            continue;
        };

        let relative = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .into_owned();

        let title = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Offline track")
            .to_string();

        items.push(LocalItem {
            id: relative.clone(),
            title,
            artist: "Desktop".to_string(),
            format: format.to_ascii_uppercase(),
            quality: "Desktop".to_string(),
            source_url: format!("vitr-sync://desktop/{}", urlencoding::encode(&relative)),
        });
    }

    items
}

fn safe_relative(root: &Path, id: &str) -> Result<PathBuf, String> {
    let candidate = root.join(id);
    let root = root
        .canonicalize()
        .map_err(|error| format!("Could not open Vitr download folder: {error}"))?;
    let candidate = candidate
        .canonicalize()
        .map_err(|error| format!("Synced track is unavailable: {error}"))?;

    if !candidate.starts_with(&root) || !candidate.is_file() {
        return Err("Refusing to sync a file outside the Vitr download folder".to_string());
    }

    Ok(candidate)
}

fn send_json_line(stream: &mut TcpStream, value: &Value) -> Result<(), String> {
    let mut encoded = serde_json::to_vec(value)
        .map_err(|error| format!("Could not encode sync response: {error}"))?;
    encoded.push(b'\n');
    stream
        .write_all(&encoded)
        .map_err(|error| format!("Could not send sync response: {error}"))?;
    stream
        .flush()
        .map_err(|error| format!("Could not flush sync response: {error}"))
}

fn send_error(stream: &mut TcpStream, message: &str) -> Result<(), String> {
    send_json_line(stream, &json!({ "ok": false, "error": message }))
}

fn handle_connection(
    mut stream: TcpStream,
    pair_code: &str,
    download_dir: &Arc<Mutex<PathBuf>>,
) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| format!("Could not configure sync socket: {error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(120)))
        .map_err(|error| format!("Could not configure sync socket: {error}"))?;

    let reader_stream = stream
        .try_clone()
        .map_err(|error| format!("Could not read sync request: {error}"))?;
    let mut reader = BufReader::new(reader_stream);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|error| format!("Could not read sync request: {error}"))?;

    let request: Value = serde_json::from_str(line.trim())
        .map_err(|error| format!("Invalid sync request: {error}"))?;

    if request
        .get("version")
        .and_then(Value::as_u64)
        != Some(PROTOCOL_VERSION)
    {
        send_error(&mut stream, "Unsupported Vitr Sync version")?;
        return Ok(());
    }

    if request
        .get("code")
        .and_then(Value::as_str)
        != Some(pair_code)
    {
        send_error(&mut stream, "Pairing code does not match")?;
        return Ok(());
    }

    let root = download_dir
        .lock()
        .map_err(|_| "Sync folder state is unavailable".to_string())?
        .clone();

    match request
        .get("op")
        .and_then(Value::as_str)
        .unwrap_or_default()
    {
        "list" => {
            let items = scan_items(&root);
            send_json_line(
                &mut stream,
                &json!({
                    "ok": true,
                    "items": items
                }),
            )?;
        }
        "get" => {
            let id = request
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| "Track id is missing".to_string())?;
            let path = safe_relative(&root, id)?;

            let format = audio_extension(&path)
                .unwrap_or_else(|| "mp3".to_string())
                .to_ascii_uppercase();
            let title = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Offline track")
                .to_string();

            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("media");
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or(0);
            let staged = std::env::temp_dir().join(format!(
                "vitr-sync-{}-{stamp}.{extension}",
                std::process::id()
            ));

            fs::copy(&path, &staged)
                .map_err(|error| format!("Could not stage synced track: {error}"))?;

            let send_result = (|| -> Result<(), String> {
                let size = staged
                    .metadata()
                    .map_err(|error| format!("Could not read staged track size: {error}"))?
                    .len();

                if size == 0 {
                    return Err("Synced track is empty".to_string());
                }

                send_json_line(
                    &mut stream,
                    &json!({
                        "ok": true,
                        "size": size,
                        "title": title,
                        "artist": "Desktop",
                        "format": format,
                        "quality": "Desktop",
                        "sourceUrl": format!("vitr-sync://desktop/{}", urlencoding::encode(id))
                    }),
                )?;

                let mut file = File::open(&staged)
                    .map_err(|error| format!("Could not open staged synced track: {error}"))?;
                std::io::copy(&mut file, &mut stream)
                    .map_err(|error| format!("Could not send synced track: {error}"))?;
                stream
                    .flush()
                    .map_err(|error| format!("Could not finish synced track: {error}"))
            })();

            let _ = fs::remove_file(&staged);
            send_result?;
        }
        _ => {
            send_error(&mut stream, "Unknown sync request")?;
        }
    }

    Ok(())
}

fn start_server(
    listener: TcpListener,
    pair_code: String,
    download_dir: Arc<Mutex<PathBuf>>,
) {
    let _ = listener.set_nonblocking(true);

    thread::spawn(move || loop {
        match listener.accept() {
            Ok((stream, _)) => {
                let pair_code = pair_code.clone();
                let download_dir = Arc::clone(&download_dir);
                thread::spawn(move || {
                    let _ = handle_connection(stream, &pair_code, &download_dir);
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(150));
            }
            Err(_) => break,
        }
    });
}

fn start_discovery(
    mdns: &ServiceDaemon,
    own_fullname: String,
    peers: Arc<Mutex<HashMap<String, SyncPeer>>>,
) -> Result<(), String> {
    let receiver = mdns
        .browse(SERVICE_TYPE)
        .map_err(|error| format!("Could not browse Vitr sync devices: {error}"))?;

    thread::spawn(move || {
        while let Ok(event) = receiver.recv() {
            match event {
                ServiceEvent::ServiceResolved(info) => {
                    if info.get_fullname() == own_fullname {
                        continue;
                    }

                    let host = info
                        .get_addresses_v4()
                        .into_iter()
                        .find(|addr| !addr.is_loopback())
                        .map(|addr| addr.to_string());

                    let Some(host) = host else {
                        continue;
                    };

                    let id = info.get_fullname().to_string();
                    let name = id
                        .split("._vitr-sync")
                        .next()
                        .unwrap_or("Vitr device")
                        .to_string();

                    let peer = SyncPeer {
                        id: id.clone(),
                        name,
                        host,
                        port: info.get_port(),
                        transport: "WLAN".to_string(),
                    };

                    if let Ok(mut map) = peers.lock() {
                        map.insert(id, peer);
                    }
                }
                ServiceEvent::ServiceRemoved(_, fullname) => {
                    if let Ok(mut map) = peers.lock() {
                        map.remove(&fullname);
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn next_pair_code() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!("{:06}", 100_000 + (nanos % 900_000) as u64)
}

fn machine_label() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Desktop".to_string())
        .chars()
        .filter(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
        .take(24)
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

#[tauri::command]
pub fn start_download_sync(
    manager: tauri::State<'_, DownloadSyncManager>,
    download_dir: String,
) -> Result<SyncStatus, String> {
    let root = PathBuf::from(download_dir);
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create Vitr download folder: {error}"))?;

    let mut state = manager
        .runtime
        .lock()
        .map_err(|_| "Sync state is unavailable".to_string())?;

    if let Some(runtime) = state.as_mut() {
        if let Ok(mut dir) = runtime.download_dir.lock() {
            *dir = root;
        }
        return status_for(runtime);
    }

    let listener = TcpListener::bind("0.0.0.0:0")
        .map_err(|error| format!("Could not start Vitr sync server: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Could not read Vitr sync port: {error}"))?
        .port();

    let pair_code = next_pair_code();
    let download_dir = Arc::new(Mutex::new(root));
    let peers = Arc::new(Mutex::new(HashMap::new()));

    let mdns = ServiceDaemon::new()
        .map_err(|error| format!("Could not start Vitr device discovery: {error}"))?;

    let label = machine_label();
    let instance_name = if label.is_empty() {
        format!("Vitr-{}", std::process::id())
    } else {
        format!("Vitr-{label}")
    };
    let host_name = format!("vitr-{}.local.", std::process::id());

    let service = ServiceInfo::new(
        SERVICE_TYPE,
        &instance_name,
        &host_name,
        "",
        port,
        HashMap::<String, String>::new(),
    )
    .map_err(|error| format!("Could not create Vitr sync service: {error}"))?
    .enable_addr_auto();

    let service_fullname = service.get_fullname().to_string();

    mdns.register(service)
        .map_err(|error| format!("Could not advertise Vitr sync: {error}"))?;

    start_discovery(
        &mdns,
        service_fullname.clone(),
        Arc::clone(&peers),
    )?;

    start_server(listener, pair_code.clone(), Arc::clone(&download_dir));

    let runtime = SyncRuntime {
        pair_code,
        download_dir,
        peers,
        _mdns: mdns,
        service_fullname,
    };

    let status = status_for(&runtime)?;
    *state = Some(runtime);
    Ok(status)
}

fn status_for(runtime: &SyncRuntime) -> Result<SyncStatus, String> {
    let mut peers = runtime
        .peers
        .lock()
        .map_err(|_| "Sync peer state is unavailable".to_string())?
        .values()
        .cloned()
        .collect::<Vec<_>>();
    peers.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(SyncStatus {
        sharing: true,
        pair_code: runtime.pair_code.clone(),
        peers,
        status: "WLAN sync ready".to_string(),
    })
}

#[tauri::command]
pub fn download_sync_status(
    manager: tauri::State<'_, DownloadSyncManager>,
) -> Result<SyncStatus, String> {
    let state = manager
        .runtime
        .lock()
        .map_err(|_| "Sync state is unavailable".to_string())?;

    match state.as_ref() {
        Some(runtime) => status_for(runtime),
        None => Ok(SyncStatus {
            sharing: false,
            pair_code: String::new(),
            peers: Vec::new(),
            status: "Sync is off".to_string(),
        }),
    }
}

fn read_json_line(stream: TcpStream) -> Result<(BufReader<TcpStream>, Value), String> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|error| format!("Could not read sync response: {error}"))?;
    let value = serde_json::from_str(line.trim())
        .map_err(|error| format!("Invalid sync response: {error}"))?;
    Ok((reader, value))
}

fn request_remote_list(peer: &SyncPeer, code: &str) -> Result<Vec<RemoteItem>, String> {
    let mut stream = TcpStream::connect((peer.host.as_str(), peer.port))
        .map_err(|error| format!("Could not connect to {}: {error}", peer.name))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| format!("Could not configure sync connection: {error}"))?;

    send_json_line(
        &mut stream,
        &json!({
            "version": PROTOCOL_VERSION,
            "op": "list",
            "code": code
        }),
    )?;

    let (_, response) = read_json_line(stream)?;

    if response.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(
            response
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("Could not read remote Vitr library")
                .to_string(),
        );
    }

    serde_json::from_value(
        response
            .get("items")
            .cloned()
            .unwrap_or_else(|| json!([])),
    )
    .map_err(|error| format!("Could not parse remote Vitr library: {error}"))
}

fn safe_filename(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|ch| {
            if matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                ch
            }
        })
        .collect::<String>();

    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "Vitr synced track".to_string()
    } else {
        trimmed.chars().take(120).collect()
    }
}

fn receive_remote_item(
    peer: &SyncPeer,
    code: &str,
    item: &RemoteItem,
    output_dir: &Path,
) -> Result<bool, String> {
    let extension = item
        .format
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();

    let extension = match extension.as_str() {
        "m4a" | "mp3" | "flac" | "wav" => extension,
        _ => "mp3".to_string(),
    };

    let destination = output_dir.join(format!(
        "{}.{}",
        safe_filename(&item.title),
        extension
    ));

    if destination.exists() {
        return Ok(false);
    }

    let mut stream = TcpStream::connect((peer.host.as_str(), peer.port))
        .map_err(|error| format!("Could not connect to {}: {error}", peer.name))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(120)))
        .map_err(|error| format!("Could not configure sync connection: {error}"))?;

    send_json_line(
        &mut stream,
        &json!({
            "version": PROTOCOL_VERSION,
            "op": "get",
            "code": code,
            "id": item.id
        }),
    )?;

    let (mut reader, header) = read_json_line(stream)?;

    if header.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(
            header
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("Could not receive remote Vitr track")
                .to_string(),
        );
    }

    let size = header
        .get("size")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Remote Vitr track has no size".to_string())?;

    let mut file = File::create(&destination)
        .map_err(|error| format!("Could not create synced track: {error}"))?;

    let mut limited = reader.by_ref().take(size);
    let copied = std::io::copy(&mut limited, &mut file)
        .map_err(|error| format!("Could not save synced track: {error}"))?;

    if copied != size {
        let _ = std::fs::remove_file(&destination);
        return Err("Sync transfer ended early".to_string());
    }

    file.flush()
        .map_err(|error| format!("Could not finish synced track: {error}"))?;
    Ok(true)
}

#[tauri::command]
pub async fn sync_downloads_from_peer(
    manager: tauri::State<'_, DownloadSyncManager>,
    peer_id: String,
    pair_code: String,
    output_dir: String,
) -> Result<SyncPullResult, String> {
    if pair_code.trim().len() != 6 {
        return Err("Enter the 6-digit pairing code shown on the other device".to_string());
    }

    let peer = {
        let state = manager
            .runtime
            .lock()
            .map_err(|_| "Sync state is unavailable".to_string())?;
        let runtime = state
            .as_ref()
            .ok_or_else(|| "Start Vitr Sync first".to_string())?;
        let peer = runtime
            .peers
            .lock()
            .map_err(|_| "Sync peer state is unavailable".to_string())?
            .get(&peer_id)
            .cloned()
            .ok_or_else(|| "That Vitr device is no longer available".to_string())?;
        peer
    };

    let code = pair_code.trim().to_string();
    let output_dir = PathBuf::from(output_dir);

    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&output_dir)
            .map_err(|error| format!("Could not create Vitr download folder: {error}"))?;

        let items = request_remote_list(&peer, &code)?;
        let mut received = 0u32;
        let mut skipped = 0u32;

        for item in items {
            match receive_remote_item(&peer, &code, &item, &output_dir)? {
                true => received += 1,
                false => skipped += 1,
            }
        }

        Ok(SyncPullResult { received, skipped })
    })
    .await
    .map_err(|error| format!("Vitr sync task failed: {error}"))?
}
