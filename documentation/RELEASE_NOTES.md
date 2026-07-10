# Release Notes

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