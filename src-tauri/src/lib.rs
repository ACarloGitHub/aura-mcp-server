use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const NOMIC_GGUF_NAME: &str = "nomic-embed-text-v2-moe.Q8_0.gguf";
const NOMIC_GGUF_URL: &str =
    "https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF/resolve/main/nomic-embed-text-v2-moe.Q8_0.gguf";
const LLAMACPP_HEALTH_TIMEOUT_MS: u64 = 800;

static MCP_CHILD: Mutex<Option<Child>> = Mutex::new(None);
static QUIT_ON_CLOSE: Mutex<bool> = Mutex::new(false);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NomicProgress {
    downloaded: u64,
    total: u64,
    percent: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NomicFinished {
    ok: bool,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerStatus {
    running: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RagStatus {
    nomic_present: bool,
    nomic_path: String,
    llama_bin_present: bool,
    llama_bin_path: String,
    llama_reachable: bool,
    llama_url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusReport {
    mcp_running: bool,
    rag: RagStatus,
    install_dir: String,
    workspace_dir: Option<String>,
    node_path: Option<String>,
    dist_index_path: String,
    dist_index_exists: bool,
    quit_on_close: bool,
}

#[cfg(target_os = "windows")]
fn no_window(cmd: &mut Command) {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn no_window(_cmd: &mut Command) {}

static NODE_PATH: OnceLock<Option<String>> = OnceLock::new();

fn cached_node_path() -> Option<String> {
    NODE_PATH.get_or_init(find_node).clone()
}

static HTTP_CLIENT: OnceLock<Option<reqwest::blocking::Client>> = OnceLock::new();

fn llama_reachable() -> bool {
    let client = HTTP_CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_millis(LLAMACPP_HEALTH_TIMEOUT_MS))
            .build()
            .ok()
    });
    let client = match client {
        Some(c) => c,
        None => return false,
    };
    let url = llama_health_url();
    match client.get(&url).send() {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    }
}

// ---------- paths ----------

fn launcher_install_dir(app: &AppHandle) -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            return parent.to_path_buf();
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        return res;
    }
    PathBuf::from(".")
}

fn dist_index_path(app: &AppHandle) -> PathBuf {
    launcher_install_dir(app).join("dist").join("index.js")
}

fn nomic_target(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| launcher_install_dir(app));
    dir.join("embeddings").join(NOMIC_GGUF_NAME)
}

fn workspace_dir_from_env() -> Option<PathBuf> {
    std::env::var_os("AGENT_WORKSPACE").map(PathBuf::from)
}

// ---------- status probes ----------

fn llama_base_url() -> (String, u16) {
    let host = std::env::var("EMBED_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("EMBED_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(11434);
    (host, port)
}

fn llama_health_url() -> String {
    let (host, port) = llama_base_url();
    format!("http://{}:{}/health", host, port)
}

fn nomic_present(app: &AppHandle) -> bool {
    nomic_target(app).is_file()
}

fn mcp_running() -> bool {
    let mut guard = MCP_CHILD.lock().unwrap();
    match &mut *guard {
        Some(child) => match child.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
                false
            }
            Ok(None) => true,
            Err(_) => {
                *guard = None;
                false
            }
        },
        None => false,
    }
}

// ---------- IPC commands ----------

#[tauri::command]
fn get_status(app: AppHandle) -> StatusReport {
    let install_dir = launcher_install_dir(&app);
    let index_js = find_index_js(&app);
    let llama_bin = find_llama_server(&app);
    StatusReport {
        mcp_running: mcp_running(),
        rag: RagStatus {
            nomic_present: nomic_present(&app),
            nomic_path: nomic_target(&app).to_string_lossy().to_string(),
            llama_bin_present: llama_bin.is_some(),
            llama_bin_path: llama_bin
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
            llama_reachable: llama_reachable(),
            llama_url: llama_health_url(),
        },
        install_dir: install_dir.to_string_lossy().to_string(),
        workspace_dir: workspace_dir_from_env().map(|p| p.to_string_lossy().to_string()),
        node_path: cached_node_path(),
        dist_index_path: index_js
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| dist_index_path(&app).to_string_lossy().to_string()),
        dist_index_exists: index_js.is_some(),
        quit_on_close: *QUIT_ON_CLOSE.lock().unwrap(),
    }
}

#[tauri::command]
fn start_server(app: AppHandle) -> Result<(), String> {
    eprintln!("[AuraMCP IPC] start_server called");
    if mcp_running() {
        return Err("Server already running".into());
    }
    start_mcp_child(&app)?;
    let _ = app.emit(
        "server-status",
        ServerStatus {
            running: true,
        },
    );
    eprintln!("[AuraMCP IPC] start_server OK");
    Ok(())
}

#[tauri::command]
fn stop_server(app: AppHandle) -> Result<(), String> {
    eprintln!("[AuraMCP IPC] stop_server called");
    stop_mcp_child();
    let _ = app.emit(
        "server-status",
        ServerStatus {
            running: false,
        },
    );
    Ok(())
}

#[tauri::command]
fn download_nomic(app: AppHandle) -> Result<(), String> {
    eprintln!("[AuraMCP IPC] download_nomic called");
    let app_clone = app.clone();
    std::thread::spawn(move || {
        download_nomic_blocking(&app_clone);
    });
    Ok(())
}

#[tauri::command]
fn open_server_folder(app: AppHandle) -> Result<(), String> {
    let dir = launcher_install_dir(&app);
    open_in_file_manager(&dir)
}

#[tauri::command]
fn get_install_paths(app: AppHandle) -> serde_json::Value {
    let install_dir = launcher_install_dir(&app);
    let dist = dist_index_path(&app);
    let workspace_default = workspace_dir_from_env()
        .unwrap_or_else(|| install_dir.join("Workspace"));
    serde_json::json!({
        "install_dir": install_dir.to_string_lossy().to_string(),
        "dist_index_path": dist.to_string_lossy().to_string(),
        "workspace_default": workspace_default.to_string_lossy().to_string(),
        "workspace_source": if workspace_dir_from_env().is_some() { "env" } else { "default" },
    })
}

#[tauri::command]
fn set_quit_on_close(quit: bool) {
    *QUIT_ON_CLOSE.lock().unwrap() = quit;
}

#[tauri::command]
fn show_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn can_self_uninstall() -> bool {
    cfg!(target_os = "windows")
}

#[tauri::command]
fn uninstall_app(app: AppHandle) -> Result<(), String> {
    stop_mcp_child();
    #[cfg(target_os = "windows")]
    {
        let install = launcher_install_dir(&app);
        let uninstaller = install.join("uninstall.exe");
        if !uninstaller.is_file() {
            return Err(format!(
                "Uninstaller not found at {}. Use Windows Settings to uninstall AuraMCP.",
                uninstaller.display()
            ));
        }
        let mut cmd = Command::new(&uninstaller);
        no_window(&mut cmd);
        cmd.spawn()
            .map_err(|e| format!("failed to launch uninstaller: {e}"))?;
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(400));
            app.exit(0);
        });
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Self-uninstall is not implemented for this platform.".to_string())
    }
}

// ---------- node / mcp child ----------

fn find_node() -> Option<String> {
    let cmd_name = if cfg!(windows) { "node.exe" } else { "node" };
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(cmd_name);
        if candidate.is_file() {
            if node_version_ok(&candidate.to_string_lossy()) {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }
    None
}

fn node_version_ok(node: &str) -> bool {
    let mut cmd = Command::new(node);
    cmd.arg("--version");
    no_window(&mut cmd);
    let out = match cmd.output() {
        Ok(o) => o,
        Err(_) => return false,
    };
    if let Ok(s) = String::from_utf8(out.stdout) {
        let s = s.trim();
        if let Some(rest) = s.strip_prefix("v") {
            if let Some((major, _)) = rest.split_once('.') {
                return major.parse::<u32>().map(|n| n >= 18).unwrap_or(false);
            }
        }
    }
    false
}

fn find_index_js(app: &AppHandle) -> Option<PathBuf> {
    let p = dist_index_path(app);
    if p.is_file() {
        return Some(p);
    }
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join("dist").join("index.js");
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn find_llama_server(app: &AppHandle) -> Option<PathBuf> {
    let exe_name = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };
    let plat = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    let install = launcher_install_dir(app);
    for rel in [
        format!("vendor/llama.cpp/{}/{}", plat, exe_name),
        format!("../vendor/llama.cpp/{}/{}", plat, exe_name),
        format!("_up_/vendor/llama.cpp/{}/{}", plat, exe_name),
    ] {
        let p = install.join(&rel);
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        for rel in [
            format!("vendor/llama.cpp/{}/{}", plat, exe_name),
            format!("{}/{}", plat, exe_name),
        ] {
            let p = res.join(&rel);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn start_mcp_child(app: &AppHandle) -> Result<(), String> {
    let node = cached_node_path()
        .ok_or_else(|| "node (>=18) not found in PATH".to_string())?;
    let index_js = find_index_js(app)
        .ok_or_else(|| "dist/index.js not found beside the launcher".to_string())?;

    let mut cmd = Command::new(&node);
    cmd.arg(&index_js)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());
    no_window(&mut cmd);

    if let Some(parent) = index_js.parent() {
        let _ = cmd.current_dir(parent.parent().unwrap_or(parent));
    }

    let gguf = nomic_target(app);
    if gguf.exists() {
        cmd.env("EMBED_GGUF", &gguf);
    }

    if let Some(bin) = find_llama_server(app) {
        cmd.env("LLAMACPP_BIN", &bin);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn node: {e}"))?;

    *MCP_CHILD.lock().unwrap() = Some(child);
    eprintln!("[AuraMCP] MCP child started: {} {}", node, index_js.display());
    Ok(())
}

fn stop_mcp_child() {
    if let Some(mut child) = MCP_CHILD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

// ---------- nomic download ----------

fn download_nomic_blocking(app: &AppHandle) {
    let target = nomic_target(app);
    if target.exists() {
        let _ = app.emit(
            "nomic-finished",
            NomicFinished {
                ok: true,
                error: None,
            },
        );
        return;
    }
    if let Some(parent) = target.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(900))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(
                "nomic-finished",
                NomicFinished {
                    ok: false,
                    error: Some(format!("http client build failed: {e}")),
                },
            );
            return;
        }
    };

    let mut resp = match client.get(NOMIC_GGUF_URL).send() {
        Ok(r) => r,
        Err(e) => {
            let _ = app.emit(
                "nomic-finished",
                NomicFinished {
                    ok: false,
                    error: Some(format!("GET failed: {e}")),
                },
            );
            return;
        }
    };
    if !resp.status().is_success() {
        let _ = app.emit(
            "nomic-finished",
            NomicFinished {
                ok: false,
                error: Some(format!("HTTP {}", resp.status())),
            },
        );
        return;
    }

    let total = resp.content_length().unwrap_or(0);
    let mut file = match std::fs::File::create(&target) {
        Ok(f) => f,
        Err(e) => {
            let _ = app.emit(
                "nomic-finished",
                NomicFinished {
                    ok: false,
                    error: Some(format!("file create failed: {e}")),
                },
            );
            return;
        }
    };

    use std::io::{Read, Write};
    let mut downloaded: u64 = 0;
    let mut buf = [0u8; 64 * 1024];
    let mut last_emit: u64 = 0;
    loop {
        let n = match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                let _ = app.emit(
                    "nomic-finished",
                    NomicFinished {
                        ok: false,
                        error: Some(format!("read error: {e}")),
                    },
                );
                return;
            }
        };
        if let Err(e) = file.write_all(&buf[..n]) {
            let _ = app.emit(
                "nomic-finished",
                NomicFinished {
                    ok: false,
                    error: Some(format!("write error: {e}")),
                },
            );
            return;
        }
        downloaded += n as u64;
        if downloaded - last_emit >= 1024 * 1024 || n == 0 {
            last_emit = downloaded;
            let percent = if total > 0 {
                ((downloaded as f64 / total as f64) * 100.0).min(100.0) as u32
            } else {
                0
            };
            let _ = app.emit(
                "nomic-progress",
                NomicProgress {
                    downloaded,
                    total,
                    percent,
                },
            );
        }
    }

    let _ = app.emit(
        "nomic-finished",
        NomicFinished {
            ok: true,
            error: None,
        },
    );
}

fn open_in_file_manager(path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("explorer");
        cmd.arg(&path_str);
        no_window(&mut cmd);
        cmd.spawn()
            .map_err(|e| format!("explorer failed: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("open failed: {e}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("xdg-open failed: {e}"))?;
    }
    Ok(())
}

// ---------- tray + window ----------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Open AuraMCP", true, None::<&str>)?;
    let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit AuraMCP", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;

    let _tray = TrayIconBuilder::with_id("main")
        .tooltip("AuraMCP")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "quit" => {
                stop_mcp_child();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_command_entry)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_server,
            stop_server,
            download_nomic,
            open_server_folder,
            get_install_paths,
            set_quit_on_close,
            show_window,
            hide_window,
            can_self_uninstall,
            uninstall_app,
            mcp_status,
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = start_mcp_child(&handle) {
                    eprintln!("[AuraMCP launcher] failed to start node: {e}");
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let quit = *QUIT_ON_CLOSE.lock().unwrap();
                if quit {
                    stop_mcp_child();
                    window.app_handle().exit(0);
                } else {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building AuraMCP launcher");
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            stop_mcp_child();
        }
    });
}

#[tauri::command]
fn mcp_status() -> bool {
    mcp_running()
}
