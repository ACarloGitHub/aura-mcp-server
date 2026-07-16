# Release Notes

## v3.4.0 (2026-07-16)

**Zero-dependency: the Node.js runtime is now bundled inside the installer.**

v3.3.0 embedded the MCP server code (`dist/` + `node_modules/`) but still
required the user to have **Node.js 22+ installed** on their machine, because
the launcher executed the system `node`. For non-technical users this was
unusable. v3.4.0 ships the official Node LTS binary inside the app and the
launcher uses that instead — no Node install required.

Changes:
- CI downloads the official Node 22 (LTS) binary per platform into
  `vendor/node/` (`node.exe` on Windows, `node` on Linux, `node-arm64` +
  `node-x64` on macOS for the universal build) and bundles it as a Tauri
  resource. Node's `LICENSE` (MIT) is included for attribution.
- `find_bundled_node()` (src-tauri/src/lib.rs) resolves the bundled node
  (honouring the Tauri v2 `_up_/` resource mapping) and the launcher prefers
  it over any `node` in PATH. On macOS the correct arch is picked at runtime;
  on Unix the executable bit is ensured before spawn. PATH is kept only as a
  dev-mode fallback.
- Because both the runtime and the `better-sqlite3` native binary now come from
  the same Node 22 ABI (127), there is no longer an ABI-mismatch risk at
  runtime.

Trade-offs:
- Installer size grows by the Node binary size (~70 MB Windows, similar on
  other platforms).
- macOS is not code-signed: Gatekeeper may still prompt. The bundled node is
  executed from inside the already-approved `.app`, which normally works, but
  this is a known unsigned-app caveat.

## v3.3.0 (2026-07-12)

**The Node MCP server is now bundled inside the installer.**

Previous versions shipped without `dist/index.js` and `node_modules/`,
so clicking "Start" always failed with "dist/index.js not found beside
the launcher".

Changes:
- `tauri.conf.json` resources now include `../dist/**/*` and
  `../node_modules/**/*` so the compiled MCP server and its
  production dependencies are embedded in the MSI/NSIS/DMG/DEB/RPM.
- CI workflow: `npm ci` (was `--ignore-scripts`) so native modules
  (better-sqlite3, sqlite-vec) get their prebuilt binaries. After
  TypeScript compilation, `npm prune --omit=dev` strips ~80 MB of
  dev tooling before bundling.
- `beforeBuildCommand` moved to CI steps (`npm run build` + prune)
  to control the order: compile, prune, then bundle.
- `find_index_js()` now also checks `resource_dir()` (macOS places
  resources under `Contents/Resources/`).
- `get_status` reports the actual resolved path.

## v3.2.5 (2026-07-12)

**Fix: Control Panel froze after a few seconds, console windows
flashed, and IPC calls timed out.**

Root causes fixed:

- **Console window flashing on Windows**: every `Command::new()` call
  spawned a visible console window. Fixed by adding
  `CREATE_NO_WINDOW` (0x08000000) to all process spawns.
- **IPC timeout after ~5 seconds**: `get_status` was called every 5s
  by `setInterval`. Each call ran `find_node()` which scans PATH and
  spawns `node --version` — slow on Windows. Fixed by caching the
  result with `OnceLock` so `find_node()` runs only once.
- **`start_server` timeout**: same cause — `start_mcp_child()` called
  `find_node()` again. Now uses the cached path.
- **`llama_reachable()` slowness**: created a new `reqwest::Client`
  (with TLS init) on every poll. Now uses a cached client.
- **App freeze at startup**: `start_mcp_child()` in `.setup()` blocked
  the Tauri runtime. Now runs in a background thread.
- **Dead child detection**: `mcp_running()` now uses `try_wait()` to
  detect if the node child has exited, instead of reporting "running"
  forever after a crash.
- **Polling interval**: increased from 5s to 10s to reduce overhead.
- **New status rows**: the Control Panel now also shows whether
  `dist/index.js` exists and whether Node.js is in PATH.

## v3.2.4 (2026-07-12)

**Critical fix: Control Panel was completely non-functional in all
previous releases (v3.2.0–v3.2.3).**

Root cause: `withGlobalTauri: true` was missing from `tauri.conf.json`.
Without this flag, Tauri 2 does not inject `window.__TAURI__` into the
webview, so every IPC call (`invoke`) failed silently and the frontend
was "cosmetic only" — no status, no buttons, no downloads.

Additional fixes:
- **llama-server binary status**: the Control Panel now shows whether
  the bundled `llama-server` binary is present in `vendor/llama.cpp/`,
  separate from whether the embedding HTTP endpoint is reachable.
- **Defensive frontend**: `app.js` now null-checks `window.__TAURI__`
  before any use, with a visible error message if the global is missing.
- **Removed duplicate `debug()` function** that shadowed the global one.

## v3.2.3 (2026-07-11)

The v3.2.2 release still had a broken Control Panel. The actual
permission identifier format in Tauri 2 is **`allow-<command>`**
(with hyphens), NOT just `<command>` or `<prefix>:<command>`.

Each `#[tauri::command]` generates two permission files:
`<command>.toml` (allow) and `<command>.toml` (deny). The
`allow-` variant is the one to list in the capability.

Fix in `src-tauri/capabilities/default.json`: replaces the
incorrect identifiers with the auto-generated `allow-*` ones.
Now the Control Panel can actually call `get_status`, `start_server`,
`stop_server`, `download_nomic`, `open_server_folder`,
`get_install_paths`, `set_quit_on_close`, `show_window`,
`hide_window`, `can_self_uninstall`, `uninstall_app`, `mcp_status`.

## v3.2.2 (2026-07-10)

Fixes the v3.2.0/v3.2.1 Control Panel, which was a non-functional
read-only UI: status stayed at "Unknown" and every button was dead.

**Root cause**: the capability JSON in `src-tauri/capabilities/default.json`
listed custom IPC commands under identifiers like `get_status` /
`app:get_status`, but Tauri's permission-identifier regex requires
the format `<plugin>:<command>` (with a single colon and only
lowercase ASCII + hyphens — no underscores). The validator rejected
the JSON; at runtime Tauri then denied every command that wasn't in
the (broken) capability.

**Fix**:
1. Capability contains only `core:*`, `dialog:*` and `opener:*`. Per
   Tauri 2 default behaviour, app-defined `#[tauri::command]`s are
   auto-allowed without a capability entry.
2. `src-tauri/build.rs` now declares all 12 custom commands via
   `AppManifest::commands`, which is the explicit form of the same
   auto-allow — defence-in-depth.
3. Control Panel now opens to a working 2-column layout (980 × 640 px)
   with the LM Studio / AnythingLLM tabs on the right.
4. Wizard is automatic on first launch: if `nomic` is missing,
   `refreshStatus()` triggers `download_nomic()` and shows the
   progress overlay without any user action.

## v3.2.1 (2026-07-10)

**Critical fix**: the Control Panel window opens but the embedded
webview shows `asset not found: index.html` on v3.2.0 because
`tauri.conf.json` had `frontendDist: "../dist"` (pointing at the
Node MCP server's compiled output, which has no `index.html`).

The Control Panel's `index.html` / `style.css` / `app.js` live at
`src-tauri/dist/`. Changed `frontendDist` to `"./dist"`.

No other changes from v3.2.0.

## v3.2.0 (2026-07-10)

The headline change in v3.2 is the new **AuraMCP Control Panel** — a
visible Tauri window that replaces the previous invisible 1x1 launcher.
It unifies three fixes that were left as known issues after v3.1.0:

1. **Live progress bar for the nomic embedding download** (was
   stderr-only, invisible to the user).
2. **Server + RAG status at a glance** (server running, nomic model
   present, llama-server reachable) with one-click Start / Stop.
3. **LM Studio / AnythingLLM wiring instructions** built into the
   panel with copy-to-clipboard JSON templates filled in with the
   user's actual install paths.

This release also adds proper Windows uninstall support: a new
"Uninstall AuraMCP…" button in the Control Panel launches the
auto-generated MSI / NSIS uninstaller. The uninstall behaviour is
"soft" by default (preserves the per-user data directory so a future
reinstall can reuse the embedding model); full removal is documented
in `documentation/setup.md` and via the Control Panel's Uninstaller
button.

### Highlights

- **Visible Control Panel window** (520x640 px, resizable, dark
  theme). Opens automatically on launch. Can be closed to the tray;
  option to quit-on-close in the Options card.
- **System tray icon** with menu (Open AuraMCP / Quit AuraMCP). Left
  click on the tray icon shows/focuses the Control Panel.
- **RAG components** monitored: nomic GGUF presence, llama-server
  reachability on `127.0.0.1:11434`. Green/yellow/red status dots.
- **Live download progress** for the embedding model via Tauri events
  (`nomic-progress`, `nomic-finished`) emitted from Rust; the
  frontend shows a centered overlay with a progress bar.
- **LM Studio and AnythingLLM tabs** in the panel: the user sees the
  exact file path to edit, the JSON to paste (with the launcher's
  install dir and a default workspace path filled in), and a
  "Copy to clipboard" button. AnythingLLM tab also documents
  `anythingllm.autoStart: false` for resource-constrained setups.
- **Windows uninstaller enhanced**:
  - The Control Panel has a "Uninstall AuraMCP…" button that spawns
    `<install_dir>\uninstall.exe` (NSIS-generated) and exits the
    launcher so the uninstaller can replace files.
- **"Browse server folder" button** opens the launcher's install
  directory in the platform's file manager (Explorer / Finder /
  xdg-open).
- **macOS / Linux uninstall** documented in `setup.md`; the Control
  Panel button on those platforms opens an alert pointing to the
  manual steps.

### New IPC commands

| Command | Purpose |
|---|---|
| `get_status` | Returns full StatusReport: MCP child PID, RAG state, install paths, quit-on-close flag. |
| `start_server` | Spawns the Node MCP child. |
| `stop_server` | Kills the Node MCP child. |
| `download_nomic` | Triggers the embedding-model download (emits events). |
| `open_server_folder` | Opens the launcher install dir in the file manager. |
| `get_install_paths` | Returns paths to fill into the host wiring JSON. |
| `set_quit_on_close` | Toggles the close-to-tray vs quit-on-close behaviour. |
| `show_window` / `hide_window` | Programmatic window visibility. |
| `can_self_uninstall` | Reports whether the platform has a self-uninstall flow. |
| `uninstall_app` | On Windows: spawn the uninstaller and exit. Otherwise returns an error pointing to docs. |

### New events

| Event | Payload |
|---|---|
| `nomic-progress` | `{ downloaded: u64, total: u64, percent: u32 }` |
| `nomic-finished` | `{ ok: bool, error?: string }` |
| `server-status` | `{ running: bool }` |

### New Tauri dependencies

- `tauri = { version = "2", features = ["tray-icon"] }` (Cargo.toml)
- `tauri-plugin-opener = "2"` (for "Browse server folder" on
  cross-platform file manager invocation)

### Files added

- `src-tauri/dist/index.html` (replaces the previous stub)
- `src-tauri/dist/style.css`
- `src-tauri/dist/app.js`
- `src-tauri/capabilities/default.json` (dialog/opener/window permissions)

### Notes

- The new bundle targets do **not** include AppImage (still removed
  from v3.1). DEB and RPM remain for Linux.
- The Control Panel only includes JS/CSS/HTML, no framework
  dependency.
- For Linux/macOS the uninstaller has to be run via the system
  package manager / manual drag-to-Trash. The Control Panel button
  shows the relevant instructions.

## v3.1.0 (2026-07-10)

The headline change in v3.1 is a **breaking** RAG rewrite. v3.0's RAG
required a separate Python installation, ChromaDB and Ollama; v3.1 ships
RAG as **pure TypeScript** on top of `sqlite-vec` with embeddings
produced by a bundled CPU-only `llama.cpp` (`nomic-embed-text-v2-moe`).
**No Python. No external services.**

This release also ships the first **bundled installer** (Tauri) — MSI /
NSIS / DMG / DEB / RPM that handle the embedding-model download via a
first-launch wizard and register the server in the system tray.

### Highlights

- **RAG is now Python-free.** The `src/rag/` module replaces `rag.py`
  with a native TypeScript implementation: `sqlite-vec` for the vector
  index, `better-sqlite3` for chunk metadata, and a vendored CPU-only
  `llama.cpp` for embeddings. The Node server starts/stops the
  embedding backend automatically on first `rag` call and on exit.
- **Embedding model**: `nomic-embed-text-v2-moe.Q8_0.gguf` (~488 MB).
  Downloaded once on first launch from Hugging Face; afterwards the
  model lives in the per-user app data directory and never leaves the
  machine.
- **Bundled installer** (Tauri) — see the
  [release assets](https://github.com/ACarloGitHub/aura-mcp-server/releases/tag/v3.1.0):
  - Windows: `.msi` (WiX) and `.exe` (NSIS)
  - macOS: universal `.dmg` (Intel + Apple Silicon) and `.app.tar.gz`
  - Linux: `.deb` and `.rpm`
- **Tray-resident launcher.** The installer places `AuraMCP` in the
  system tray. The launcher spawns the Node MCP server, shows first-run
  setup dialog, registers the embedding model, and stays resident until
  the user quits from the tray menu.
- **`/v1/embeddings` OpenAI-compatible endpoint** is what the Node
  server uses to talk to `llama-server`. llama.cpp's `/api/embeddings`
  was not used (it 404s on b9680+).
- **Removed**: `rag.py`, `session_export.py`, the `scripts/` directory,
  `install.bat`, `install.sh`, `start.bat`, `start.sh`, and the Python
  helpers from `src/utils/helpers.ts` (`getPythonPath`, `findPythonInPath`,
  `isPythonUsable`).
- **Removed env vars**: `RAG_PYTHON_PATH`, `CHROMA_DATA_DIR`,
  `OLLAMA_EMBED_URL`, `OLLAMA_EMBED_MODEL`, `BRAVE_API_KEY`.

### Embedding endpoint reference

| Endpoint | Status |
|---|---|
| `POST /v1/embeddings` | **Used** (OpenAI-compatible, returns `{data: [{embedding: number[]}]}`). |
| `POST /api/embeddings` | Not used (404 on llama.cpp b9680). |
| `GET /health` | Used for readiness check. |
| `GET /api/tags` | Not used (404). |

### Breaking changes from v3.0

- The RAG is now native TypeScript; any external Python integration
  (custom ChromaDB indexes, Ollama proxies) no longer applies.
- `EMBED_GGUF` is auto-detected from the per-user app data directory
  when using the bundled installer. From source, point it at the GGUF
  manually.
- `RAG_DATA_DIR` now points at the workspace's `rag/rag_data/`
  directory (was previously `rag/chroma_data/`).

### Notes

- The bundled installer does **not** sign executables. SmartScreen
  warnings on Windows and Gatekeeper blocks on macOS are expected.
  Workaround: right-click → Open / "More info → Run anyway" the first
  time.
- The Node MCP server still requires Node.js 18+ on the host machine
  (the Tauri launcher spawns it as a child process).
- Linux AppImage was removed from the bundle target because
  `linuxdeploy` could not bundle the vendored `vendor/llama.cpp/` `.so`
  files. DEB and RPM remain.

## v3.0.0 (2026-07-07)

The headline change in v3.0 is a **breaking** consolidation: the v2.x tool surface had 39 granular entries (each function a separate tool name); v3.0 ships **11** consolidated tools, most with an `action` enum.

### Highlights

- **11 consolidated tools.** Down from 39.
- **`[INSTRUCTION: ...]` prefixes** on every multi-line tool result, telling the model how to summarize for the user.
- **Per-type truncation** (`LIMITS` in `src/utils/truncate.ts`): web snippet 300, RAG chunk 500, wiki body 4,000, file body 10,000, exec output 200,000.
- **`outputSchema` + `structuredContent`** on six stable-shape tools: `web_search`, `rag`, `planner(status)`, `exec_job(poll)`, `wiki(list)`, `compact(status)`. Mirrored in `content[0].text` for clients that ignore `structuredContent`.
- **Sandbox.** `file`/`wiki` reject absolute paths outside `AGENT_WORKSPACE` unless listed in `AURA_ALLOWED_PATHS` (Windows `;` / POSIX `:`).
- **Category filter.** `AURA_ENABLED_CATEGORIES` selects a subset of the 11 tool names at boot.
- **Exec deny-list.** Refuses `rm -rf /`, `format C:`, `del /f /s /q C:\`, `mkfs /dev/...`, `dd of=/dev/...`. Override with `AURA_DISABLE_EXEC_DENYLIST=1` (not recommended).
- **Compact descriptions.** Every `description` is one sentence ending in "Use for: ..."; max 120 chars.
- **Updated docs**. README, TOOLS.md, `documentation/setup.md`, `documentation/env-vars.md`, `documentation/wiki.md`, `documentation/compaction.md`, `documentation/planner.md`, `documentation/architecture.md`.

### Tools (final list)

| Name | `action` values | `outputSchema` |
|---|---|---|
| `file` | `read` \| `write` \| `edit` \| `list` | — |
| `exec` | `run` \| `background` | — |
| `exec_job` | `poll` \| `kill` \| `list` \| `clean` | yes (poll) |
| `web_search` | — | yes |
| `wiki` | `search` \| `read` \| `write` \| `list` | yes (list) |
| `wiki_ingest` | `ingest` \| `query` \| `lint` \| `update_index` \| `update_log` | — |
| `rag` | `search` \| `add` \| `list` \| `delete` \| `collections` \| `ingest_sessions` | yes (search) |
| `planner` | `create` \| `read` \| `list` \| `update` \| `delete` \| `next` \| `status` | yes (status) |
| `compact` | `memory` \| `status` \| `list` | yes (status) |
| `anythingllm` | `list` \| `export` \| `export-all` | — |
| `notify` | — | — |

### New environment variables

| Variable | Default | Description |
|---|---|---|
| `AURA_ALLOWED_PATHS` | empty | Opt-in absolute paths outside `AGENT_WORKSPACE` (`:` POSIX, `;` Windows). |
| `AURA_ENABLED_CATEGORIES` | all 11 | Comma-separated whitelist of tool names. Boot-time filter; no runtime reload. |
| `AURA_DISABLE_EXEC_DENYLIST` | unset | When `1`, the catastrophic-pattern check in `exec` is skipped. |

### Breaking changes from v2.x

The granular names `read`, `write`, `edit`, `list_dir`, `wiki_search`, `wiki_read`, `wiki_write`, `wiki_list`, `wiki_ingest_raw`, `wiki_ingest_query`, `wiki_ingest_lint`, `wiki_ingest_update_index`, `wiki_ingest_update_log`, `rag_search`, `rag_add`, `rag_list`, `rag_delete`, `rag_collections`, `rag_ingest_sessions`, `planner_create`, `planner_read`, `planner_list`, `planner_update`, `planner_delete`, `planner_next`, `planner_status`, `compact_memory`, `compact_status`, `compact_list`, `anythingllm_list`, `anythingllm_export`, `anythingllm_export_all`, `exec_poll`, `exec_kill`, `exec_list`, `exec_clean` **no longer exist**. The server returns `Unknown tool: <name>` for any pre-v3.0 call.

Update host-side config and prompts to the consolidated shape. AnythingLLM and LM Studio reload the descriptor list when the server restarts; no manual host edit required beyond that.

`exec` keeps the legacy `background: true` flag for compatibility; new code should use `action="background"`.

### Notes

- The plan originally targeted 36 tools; the v2.1.0 baseline actually exposed 39 (the four `read|write|edit|list_dir` granular aliases in addition to the wiki/rag family). v3.0 collapses all 39 to 11.
- Description length target in the plan (≥40% average reduction) was not hit (~13% instead): the "Use for: ..." suffix + already-short v2.1 descriptions made aggressive shrinking impractical. The ≤120 char ceiling is met.
- No new npm dependencies. `@modelcontextprotocol/sdk` 1.29 (already installed) supports `outputSchema`/`structuredContent`.
- The v2.1.0 archive lives under `docs/Old/` (excluded from git, retained locally as historical reference); not edited and not part of the published repo.