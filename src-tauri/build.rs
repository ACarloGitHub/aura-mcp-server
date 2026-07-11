fn main() {
    let commands: &'static [&'static str] = &[
        "get_status",
        "start_server",
        "stop_server",
        "download_nomic",
        "open_server_folder",
        "get_install_paths",
        "set_quit_on_close",
        "show_window",
        "hide_window",
        "can_self_uninstall",
        "uninstall_app",
        "mcp_status",
    ];
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .unwrap();
}