use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

static MCP_CHILD: Mutex<Option<Child>> = Mutex::new(None);

const NOMIC_GGUF_NAME: &str = "nomic-embed-text-v2-moe.Q8_0.gguf";
const NOMIC_GGUF_URL: &str = "https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF/resolve/main/nomic-embed-text-v2-moe.Q8_0.gguf";

fn start_mcp_child(app: &tauri::AppHandle) -> Result<(), String> {
    let node = find_node();
    let index_js = find_index_js(&app);

    let node = node.ok_or_else(|| "node (>=18) not found in PATH".to_string())?;
    let index_js = index_js.ok_or_else(|| "dist/index.js not found beside the launcher".to_string())?;

    let child = Command::new(&node)
        .arg(&index_js)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to spawn node: {e}"))?;

    *MCP_CHILD.lock().unwrap() = Some(child);
    Ok(())
}

fn stop_mcp_child() {
    if let Some(mut child) = MCP_CHILD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn find_node() -> Option<String> {
    let cmd_name = if cfg!(windows) { "node.exe" } else { "node" };
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(cmd_name);
        if candidate.is_file() {
            let path_str = candidate.to_string_lossy().into_owned();
            if node_version_ok(&path_str) {
                return Some(path_str);
            }
        }
    }
    None
}

fn node_version_ok(node: &str) -> bool {
    let out = Command::new(node).arg("--version").output();
    if let Ok(out) = out {
        if let Ok(s) = String::from_utf8(out.stdout) {
            let s = s.trim();
            if let Some(rest) = s.strip_prefix("v") {
                if let Some((major, _)) = rest.split_once('.') {
                    return major.parse::<u32>().map(|n| n >= 18).unwrap_or(false);
                }
            }
        }
    }
    false
}

fn find_index_js(_app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let candidates = [
        std::path::Path::new("dist").join("index.js"),
        std::path::Path::new("../dist").join("index.js"),
        std::path::Path::new("../../dist").join("index.js"),
    ];
    for c in &candidates {
        if c.is_file() {
            return Some(c.clone());
        }
    }
    None
}

fn nomic_target(app: &tauri::AppHandle) -> std::path::PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    data_dir.join("embeddings").join(NOMIC_GGUF_NAME)
}

fn ensure_nomic_gguf(app: &tauri::AppHandle) {
    let target = nomic_target(app);
    if target.exists() {
        eprintln!("[AuraMCP launcher] embeddings GGUF present at {}", target.display());
        return;
    }
    if let Some(parent) = target.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    eprintln!(
        "[AuraMCP launcher] embeddings GGUF missing; first-time wizard will run. Target: {}",
        target.display()
    );

    let app_for_dialog = app.clone();
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    app_for_dialog
        .dialog()
        .message(format!(
            "AuraMCP needs to download the local embedding model (~488 MB) for offline RAG. Continue?\n\nIt will be saved to:\n{}",
            target.display()
        ))
        .title("First-time setup")
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
            "Download".into(),
            "Cancel".into(),
        ))
        .show(move |response| {
            let _ = tx.send(response);
        });
    let confirmed = rx.recv().unwrap_or(false);
    if !confirmed {
        eprintln!("[AuraMCP launcher] user cancelled first-time setup; exiting");
        std::process::exit(0);
    }
    eprintln!("[AuraMCP launcher] downloading GGUF from {}", NOMIC_GGUF_URL);
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[AuraMCP launcher] http client build failed: {e}");
            std::process::exit(1);
        }
    };
    let mut resp = match client.get(NOMIC_GGUF_URL).send() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[AuraMCP launcher] GET failed: {e}");
            std::process::exit(1);
        }
    };
    if !resp.status().is_success() {
        eprintln!("[AuraMCP launcher] GET HTTP {}", resp.status());
        std::process::exit(1);
    }
    let total = resp.content_length().unwrap_or(0);
    let mut file = match std::fs::File::create(&target) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("[AuraMCP launcher] file create {}: {e}", target.display());
            std::process::exit(1);
        }
    };
    use std::io::{Read, Write};
    let mut downloaded: u64 = 0;
    let mut buf = [0u8; 64 * 1024];
    let mut last_log: u64 = 0;
    loop {
        let n = match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                eprintln!("[AuraMCP launcher] read error: {e}");
                std::process::exit(1);
            }
        };
        if let Err(e) = file.write_all(&buf[..n]) {
            eprintln!("[AuraMCP launcher] write error: {e}");
            std::process::exit(1);
        }
        downloaded += n as u64;
        if total > 0 && downloaded - last_log >= 25 * 1024 * 1024 {
            eprintln!("[AuraMCP launcher] downloaded {} / {} bytes", downloaded, total);
            last_log = downloaded;
        }
    }
    eprintln!(
        "[AuraMCP launcher] GGUF saved at {} ({} bytes)",
        target.display(),
        downloaded
    );
}

#[tauri::command]
fn mcp_status() -> bool {
    MCP_CHILD.lock().unwrap().is_some()
}

#[cfg_attr(mobile, tauri::mobile_command_entry)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            ensure_nomic_gguf(app.handle());
            if let Err(e) = start_mcp_child(app.handle()) {
                eprintln!("[AuraMCP launcher] failed to start node: {e}");
            }
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                stop_mcp_child();
                std::process::exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![mcp_status])
        .build(tauri::generate_context!())
        .expect("error while building AuraMCP launcher");
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            stop_mcp_child();
        }
    });
    stop_mcp_child();
}
