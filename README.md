# AuraMCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives your local LLM persistent memory, semantic search, a structured wiki, planner, session compaction, desktop notifications and AnythingLLM integration — all local, all private.

> Works with [AnythingLLM](https://anythingllm.com) Desktop and [LM Studio](https://lmstudio.ai) 0.3.17+.

<p align="center">
  <a href="#installation"><img src="https://img.shields.io/badge/Install-Download_Latest-4299E1?style=for-the-badge" alt="Install"></a>
  <a href="#requirements"><img src="https://img.shields.io/badge/Requires-Node.js_18%2B-48BB78?style=for-the-badge" alt="Requirements"></a>
  <a href="#privacy"><img src="https://img.shields.io/badge/Privacy-100%25_Local-E53E3E?style=for-the-badge" alt="Privacy"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-F6E05E?style=for-the-badge" alt="License"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/typescript-5.0+-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/node.js-18+-green?logo=node.js&logoColor=green" alt="Node.js">
  <img src="https://img.shields.io/badge/MCP_SDK-1.0-8B5CF6" alt="MCP SDK">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/Privacy-Local_Only-red" alt="Privacy">
</p>

## Features

| | |
|---|---|
| 🧬 **Personality** | `SOUL.md` defines who the agent is. First boot asks for name, role and language. |
| 📝 **Memory** | `MEMORY.md` for session notes. Auto-compacts when >300 lines. |
| 👤 **User Profile** | `USER.md` for preferences, filled in over time. |
| 📚 **Wiki** | Full Karpathy-style wiki with summaries, concepts, entities, syntheses. |
| 📋 **Planner** | Phased project plans with checklists and blocking questions. |
| 📦 **Session Compaction** | Compact long conversations into summaries. |
| 🔎 **RAG** | Semantic search via a native TypeScript engine (sqlite-vec) over sessions and auto-extracted entities. **No Python.** |
| 💬 **AnythingLLM** | Export chat sessions directly from AnythingLLM API. |
| 🔔 **Notifications** | Desktop notifications + beep when the agent completes tasks. |
| 🛠️ **11 Built-in Tools** | `file`, `exec`, `exec_job`, `web_search`, `wiki`, `wiki_ingest`, `rag`, `planner`, `compact`, `anythingllm`, `notify`. |

## Requirements

- **Node.js 18+** (only needed if you run from source — the bundled installer bundles Node.js spawning logic)
- **AnythingLLM Desktop 1.8+** or **LM Studio 0.3.17+**
- **A workspace directory** (any empty folder; the agent will populate it on first boot)

## Installation

### Recommended: download the bundled installer

Grab the latest release for your platform from
[GitHub Releases](https://github.com/ACarloGitHub/aura-mcp-server/releases):

- **Windows**: `AuraMCP_3.1.0_x64-setup.exe` (NSIS) or `AuraMCP_3.1.0_x64_en-US.msi` (WiX)
- **macOS**: `AuraMCP_3.1.0_universal.dmg` (Intel + Apple Silicon)
- **Linux**: `AuraMCP_3.1.0_amd64.deb` or `AuraMCP-3.1.0-1.x86_64.rpm`

The installer launches `AuraMCP`, a small tray-resident program that:

1. **On first launch**, shows a one-time setup dialog asking to download the
   embedding model (~488 MB). After confirming, the model downloads into the
   per-user app data directory and the server starts automatically.
2. **On every launch**, spawns the Node.js MCP server in the background and
   stays resident so the host application can reach it via stdio.
3. **On exit**, cleanly shuts down the MCP server and the embedded
   `llama.cpp` embedding backend (if RAG was used).

The installer registers `AuraMCP` in the system tray. Right-click the tray
icon to stop the server or quit.

### Alternative: run from source

If you prefer to develop against the source, or your platform isn't
covered by the installer:

```bash
git clone https://github.com/ACarloGitHub/aura-mcp-server.git
cd aura-mcp-server
npm install
npm run build
node dist/index.js
```

Then point your MCP host at the absolute path of `dist/index.js` — see
[documentation/setup.md](documentation/setup.md) for the exact JSON to
paste into AnythingLLM or LM Studio.

> The Tauri desktop launcher is the primary delivery path; running from
> source is intended for developers and contributors.

## Configuration

After the installer has run once (or after starting the server manually),
point your MCP host at AuraMCP:

- **AnythingLLM**: edit `<storage>/plugins/anythingllm_mcp_servers.json`
- **LM Studio**: edit `~/.lmstudio/mcp.json` (Windows: `%USERPROFILE%\.lmstudio\mcp.json`)

Both hosts follow the same `mcpServers: { name: { command, args, env } }`
shape. See [documentation/setup.md](documentation/setup.md) for full
examples and the difference between the two hosts' startup behaviour.

A starter template lives at
[`lm-studio-config.example.json`](lm-studio-config.example.json) in this
repo. Copy it, fill in your paths, save as `lm-studio-config.json`
(next to `dist/index.js`), and reference it from your host's config.

### AnythingLLM API (optional)

To use the `anythingllm` tool (chat export), copy the template:

```bash
cp api-key.example.json api-key.json
# edit api-key.json and insert your AnythingLLM API key
```

Get your key from AnythingLLM → Settings → API Keys. You can also set
it via the `ANYTHINGLLM_API_KEY` environment variable.

### Workspace

Pick any directory; the agent will populate it on first boot:

```bash
mkdir -p ~/aura-workspace
```

Pass that path as `AGENT_WORKSPACE` in the host's MCP config. The agent
writes `SOUL.md`, `MEMORY.md`, `USER.md`, `Wiki/`, `plans/` and
`compacted-sessions/` there.

## Tools

| Tool | What it does |
|------|-------------|
| `file` | Read, write, edit, or list a file in the workspace. |
| `exec` | Run shell commands (timeout, background jobs, workdir, env). |
| `exec_job` | Manage a background exec job (poll, kill, list, clean). |
| `web_search` | Web search via DuckDuckGo. |
| `wiki` | Manage the local wiki (search, read, write, list). |
| `wiki_ingest` | Advanced wiki ingest, lint, index updates. |
| `rag` | Semantic search using a native sqlite-vec engine + `nomic-embed-text-v2-moe`. |
| `planner` | Create and execute phased plans with blocking questions. |
| `compact` | Memory compaction + session archiving. |
| `anythingllm` | Export chat sessions from AnythingLLM API. |
| `notify` | Desktop notification + beep when tasks complete. |

Per-tool schemas, action enums and body limits are documented in
[`TOOLS.md`](TOOLS.md). All multi-line results start with a
`[INSTRUCTION: ...]` prefix telling the model how to summarise for the
user.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_WORKSPACE` | server dir | Working directory. All file ops scoped here. |
| `ANYTHINGLLM_API_KEY` | — | AnythingLLM API key (or use `api-key.json`). |
| `AURA_ALLOWED_PATHS` | empty | Opt-in absolute paths outside `AGENT_WORKSPACE` (Windows `;` / POSIX `:`). |
| `AURA_ENABLED_CATEGORIES` | all 11 | Comma-separated whitelist of tool names. |
| `AURA_DISABLE_EXEC_DENYLIST` | unset | Set to `1` to skip the exec deny-list. **Not recommended.** |
| `LLAMACPP_BIN` | auto-detected | Path to the `llama-server` embedding binary (vendored in the installer). |
| `EMBED_GGUF` | auto-detected | Path to the `nomic-embed-text-v2-moe.Q8_0.gguf` model. |
| `EMBED_HOST` / `EMBED_PORT` | `127.0.0.1` / `11434` | Embedding server bind address. |
| `RAG_DATA_DIR` | `{workspace}/rag/rag_data` | sqlite-vec vector index directory. |
| `LM_STUDIO_CONVERSATIONS_DIR` | `~/.lmstudio/conversations` | LM Studio sessions directory. |
| `MCP_DEBUG` | unset | Set to `1` for verbose debug logging. |
| `MCP_DISABLE_AUTONOTIFY` | unset | Set to `1` to suppress desktop notifications. |
| `MCP_LOG_MAX_MB` | `10` | Soft cap on `mcp-server.log` before rotation. |

See [documentation/env-vars.md](documentation/env-vars.md) for full
precedence rules and per-tool details.

## Privacy

- **100% local.** No telemetry, no outbound calls except for `web_search`
  (DuckDuckGo Lite) and the one-time embedding-model download.
- **Embedding model** (`nomic-embed-text-v2-moe.Q8_0.gguf`, ~488 MB)
  is downloaded once from Hugging Face and stored locally. Subsequent
  embeddings are produced by a bundled CPU-only `llama.cpp` server on
  `127.0.0.1:11434`.
- **No Python.** The RAG pipeline is pure TypeScript (`sqlite-vec` +
  native `better-sqlite3` + bundled `llama.cpp`).

## Project Structure

```
aura-mcp-server/
├── SOUL.md, USER.md, MEMORY.md   # Agent templates (filled at first boot)
├── HELP.md                       # Quick command reference
├── TOOLS.md                      # Detailed tool documentation
├── api-key.example.json          # AnythingLLM API key template
├── lm-studio-config.example.json # MCP config template
├── src/
│   ├── index.ts                  # Server bootstrap + dispatch
│   ├── tools/                    # 11 tool implementations
│   ├── rag/                      # Native sqlite-vec RAG (no Python)
│   └── utils/                    # Sandbox, truncation, helpers
├── documentation/                # User-facing docs (English)
│   ├── setup.md
│   ├── architecture.md
│   ├── env-vars.md
│   ├── wiki.md, compaction.md, planner.md
│   ├── RELEASE_NOTES.md
│   └── RELEASE_PROCESS.md
└── src-tauri/                    # Desktop launcher (Rust + TypeScript)
```

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Model Context Protocol](https://modelcontextprotocol.io)