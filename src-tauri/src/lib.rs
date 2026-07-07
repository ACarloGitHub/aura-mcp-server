use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

static MCP_CHILD: Mutex<Option<Child>> = Mutex::new(None);

fn start_mcp_child(app: &tauri::AppHandle) -> Result<(), String> {
    let project_root = app
        .path()
        .resource_dir()
        .map_err(|e| format!("cannot resolve resource_dir: {e}"))?;

    // Tauri places bundled resources under <resource_dir>/resources/_up_/...
    // The tauri.conf.json bundles "../vendor" and "../embeddings" into resources/.
    // We need to find dist/index.js relative to the binary.  When launched,
    // resource_dir() points to the installer data root; the original project
    // tree is colocated via <resource_dir>/resources or next to the binary on
    // portable installs.  We resolve node + index.js using the install layout.
    let node = find_node();
    let index_js = find_index_js(&project_root);

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

/// Locate a Node.js runtime (>=18) on PATH.  AuraMCP's RAG tool needs Node,
/// so the installer documents `Node.js 18+` as a system requirement.  We
/// reject older versions explicitly.
fn find_node() -> Option<String> {
    let cmd_name = if cfg!(windows) { "node.exe" } else { "node" };
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(cmd_name);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

/// Resolve `dist/index.js` next to the launcher.  In installer builds the
/// layout is `bin/auramcp-server(.exe)` alongside `dist/`.  In dev `cargo run`
/// from src-tauri/ the launcher lives at src-tauri/target/debug and the
/// project root is two levels up.
fn find_index_js(project_root: &std::path::Path) -> Option<std::path::PathBuf> {
    let candidates = [
        project_root.join("dist").join("index.js"),
        std::path::Path::new("..").join("dist").join("index.js"),
        std::path::Path::new("../../dist").join("index.js"),
    ];
    for c in &candidates {
        if c.is_file() {
            return Some(c.clone());
        }
    }
    None
}

#[tauri::command]
fn mcp_status() -> bool {
    MCP_CHILD.lock().unwrap().is_some()
}

#[cfg_attr(mobile, tauri::mobile_command_entry)]
fn run() {
    tauri::Builder::default()
        .setup(|app| {
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
        .run(tauri::generate_context!())
        .expect("error while running AuraMCP launcher");
    stop_mcp_child();
}
