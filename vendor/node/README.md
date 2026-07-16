# Bundled Node runtime

This directory hosts the **bundled Node.js runtime** used by the launcher so the
app has **zero user-side dependencies** (no Node.js install required).

It is populated at **build time** by the release CI
(`.github/workflows/release.yml`, step "Download bundled Node runtime") which
downloads the official Node LTS binary matching the build platform:

- Windows  → `node.exe`
- Linux    → `node`
- macOS    → `node-arm64` + `node-x64` (universal build, arch chosen at runtime)

A copy of Node's `LICENSE` (MIT) is placed here too for attribution.

This `README.md` is committed only so the Tauri resource glob `../vendor/node/*`
always matches at least one file (Tauri's `build.rs` errors if a resource glob
matches nothing). It is harmless when bundled.

Do NOT commit the actual node binaries (they are large and platform-specific).
