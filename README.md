# Aura MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for [AnythingLLM](https://anythingllm.com) and [LM Studio](https://lmstudio.ai) that gives your local LLM persistent memory, semantic search, a structured wiki, planner, session compaction, desktop notifications and direct AnythingLLM integration. Runs locally, all data stays on your machine.

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-5_min-4299E1?style=for-the-badge" alt="Quick Start"></a>
  <a href="#-requirements"><img src="https://img.shields.io/badge/Requirements-Node.js%2018%2B-48BB78?style=for-the-badge" alt="Requirements"></a>
  <a href="#-privacy"><img src="https://img.shields.io/badge/Privacy-100%25_Local-E53E3E?style=for-the-badge" alt="Privacy"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-F6E05E?style=for-the-badge" alt="License"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/typescript-5.0+-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/node.js-18+-green?logo=node.js&logoColor=green" alt="Node.js">
  <img src="https://img.shields.io/badge/MCP_SDK-1.29-8B5CF6" alt="MCP SDK">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS%20%7C%20WSL-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/Tools-11-2563eb" alt="11 tools">
  <img src="https://img.shields.io/badge/Privacy-Local%20Only-red" alt="Privacy">
</p>

## Features

| | |
|---|---|
| 🧬 **Personality** | `SOUL.md` defines who the agent is. First boot asks for name, role and language. |
| 📝 **Memory** | `MEMORY.md` for session notes. Auto-compacts when > 300 lines. |
| 👤 **User Profile** | `USER.md` for preferences, filled in over time. |
| 📚 **Wiki** | Full [Karpathy-style wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) with summaries, concepts, entities, syntheses. |
| 📋 **Planner** | Phased project plans with checklists and blocking questions. |
| 📦 **Session Compaction** | Compact long conversations into summaries. Start fresh without losing context. |
| 🔎 **RAG** | Semantic search via ChromaDB over sessions and auto-extracted entities. |
| 💬 **AnythingLLM** | Export chat sessions directly from AnythingLLM API. |
| 🔔 **Notifications** | Desktop notifications + beep when the agent completes tasks (Windows/Linux/macOS). |
| 🛠️ **11 Tools** | `file`, `exec`, `exec_job`, `web_search`, `wiki`, `wiki_ingest`, `rag`, `planner`, `compact`, `anythingllm`, `notify`. |

## Quick Start

### Windows

```bat
git clone https://github.com/ACarloGitHub/aura-mcp-server.git
cd aura-mcp-server
install.bat
```

### Linux / macOS / WSL

```bash
git clone https://github.com/ACarloGitHub/aura-mcp-server.git
cd aura-mcp-server
chmod +x install.sh && ./install.sh
```

### Manual

```bash
git clone https://github.com/ACarloGitHub/aura-mcp-server.git
cd aura-mcp-server
npm install
npm run build
```

Then add to your MCP config (see `lm-studio-config.example.json`):

```json
{
  "mcpServers": {
    "aura-mcp-server": {
      "command": "node",
      "args": ["/path/to/aura-mcp-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "/path/to/your/workspace"
      }
    }
  }
}
```

**Windows paths** use double backslashes (`"C:\\\\Users\\\\you\\\\workspace"`).

Restart AnythingLLM / LM Studio. The server connects automatically.

## Requirements

- Node.js 18+
- AnythingLLM 1.8+ or LM Studio 0.3.17+ (both speak MCP over stdio)
- Python 3 with `chromadb` (only for `rag`)
- Ollama with `nomic-embed-text` (only for `rag`)

## Tools (11 in v3.0)

Most tools take an `action` parameter. `web_search` and `notify` do not.

| Tool | Action values | Has `outputSchema` | What it does |
|------|---------------|--------------------|--------------|
| `file` | `read` \| `write` \| `edit` \| `list` | no | Read, write, edit, or list a file in the workspace. |
| `exec` | `run` \| `background` | no | Run a shell command. Returns a sessionId when `action=background`. |
| `exec_job` | `poll` \| `kill` \| `list` \| `clean` | yes (poll) | Manage background exec jobs. |
| `web_search` | — | yes | Search the web via DuckDuckGo (default) or Brave. |
| `wiki` | `search` \| `read` \| `write` \| `list` | yes (list) | Manage the local wiki. |
| `wiki_ingest` | `ingest` \| `query` \| `lint` \| `update_index` \| `update_log` | no | Advanced wiki: ingest raw files, run lint, refresh the index. |
| `rag` | `search` \| `add` \| `list` \| `delete` \| `collections` \| `ingest_sessions` | yes (search) | Semantic search and document CRUD over ChromaDB. |
| `planner` | `create` \| `read` \| `list` \| `update` \| `delete` \| `next` \| `status` | yes (status) | Create and execute phased plans with blocking questions. |
| `compact` | `memory` \| `status` \| `list` | yes (status) | Compact MEMORY.md and list previous compactions. |
| `anythingllm` | `list` \| `export` \| `export-all` | no | List or export AnythingLLM workspaces. |
| `notify` | — | no | Desktop notification + optional beep. |

See [TOOLS.md](TOOLS.md) for parameter schemas and examples. See [docs/setup.md](docs/setup.md) for install flows.

## Breaking changes from v2.x

v3.0 ships a smaller tool surface and is **not** backwards-compatible at the tool-call layer. Granular names like `wiki_search`, `planner_create`, `rag_search`, `exec_poll` no longer exist; the server returns `Unknown tool: <name>` for any pre-v3.0 name.

| Before (v2.x) | After (v3.0) |
|---|---|
| `read`, `write`, `edit`, `list_dir` | `file(action=read\|write\|edit\|list, ...)` |
| `exec` + 4 helpers (`exec_poll`, `exec_kill`, `exec_list`, `exec_clean`) | `exec(action=run\|background)` + `exec_job(action=poll\|kill\|list\|clean)` |
| `wiki_search`, `wiki_read`, `wiki_write`, `wiki_list` | `wiki(action=search\|read\|write\|list, ...)` |
| `wiki_ingest_raw`, `wiki_ingest_query`, `wiki_ingest_lint`, `wiki_ingest_update_index`, `wiki_ingest_update_log` | `wiki_ingest(action=ingest\|query\|lint\|update_index\|update_log, ...)` |
| `rag_search`, `rag_add`, `rag_list`, `rag_delete`, `rag_collections`, `rag_ingest_sessions` | `rag(action=..., ...)` |
| `planner_create`, `planner_read`, `planner_list`, `planner_update`, `planner_delete`, `planner_next`, `planner_status` | `planner(action=create\|read\|list\|update\|delete\|next\|status, ...)` |
| `compact_memory`, `compact_status`, `compact_list` | `compact(action=memory\|status\|list, ...)` |
| `anythingllm_list`, `anythingllm_export`, `anythingllm_export_all` | `anythingllm(action=list\|export\|export-all, ...)` |
| `web_search`, `notify` | unchanged (no `action`) |

Practical guidance:

- The server returns `Error: Unknown tool: <old-name>` on stale callers. Update prompts and config to the new shape.
- Host-side: AnythingLLM and LM Studio use the *server's* descriptor (`tools/list`), so their UI updates as soon as the server is restarted; no host config edit is needed for the surface change itself.
- The `exec` tool keeps a `background: true` flag for legacy compatibility. New code should use `action="background"`.

## Context budget

Tools/list is included in **every** chat turn by the host. v3.0 caps the surface at 11 tools (down from 39) and keeps each description under 120 chars. For local 7–13B models with 4k–32k context windows, this leaves room for the actual conversation.

Each multi-line tool result starts with `[INSTRUCTION: ...]`, an inline prefix the model treats as guidance on how to summarize the result for the user. The prefix stays visible so AnythingLLM and LM Studio's raw-text card UI display the instruction as well as the body.

Per-tool body limits (the cap on the *text returned to the model*):

| Tool | Field | Limit |
|---|---|---|
| `web_search` | snippet per item | 300 chars |
| `rag` | snippet per chunk | 500 chars |
| `wiki` (read) | body | 4,000 chars |
| `wiki` (search/list) | snippet per item | 300 chars |
| `file` (read text) | body | 10,000 chars |
| `exec` | total stdout/stderr | 200,000 chars |

Bodies over the limit carry a `[... truncated: N chars total]` footnote.

## Configuration

### AnythingLLM API (optional)

For the `anythingllm` tool, copy `api-key.example.json` to `api-key.json` and insert your key. Or set `ANYTHINGLLM_API_KEY=your-key` in the MCP config `env` block.

### RAG Setup (optional)

```bash
pip install chromadb
ollama pull nomic-embed-text
ollama serve
```

### Disable the exec deny-list

The `exec` tool refuses `rm -rf /`, `format C:`, `del /f /s /q C:\`, `mkfs /dev/...` and `dd of=/dev/...` patterns. To override (you almost certainly should not), set:

```json
"env": { "AURA_DISABLE_EXEC_DENYLIST": "1" }
```

The client host (LM Studio or AnythingLLM) still shows a confirmation dialog before every call. The deny-list is a defense-in-depth measure, not a replacement.

### Allow extra filesystem paths

By default, `file`/`wiki` refuse absolute paths outside `AGENT_WORKSPACE`. Opt in trusted paths with `AURA_ALLOWED_PATHS` (semicolon-separated on Windows, colon-separated on POSIX):

```json
"env": {
  "AGENT_WORKSPACE": "C:\\Users\\you\\workspace",
  "AURA_ALLOWED_PATHS": "C:\\Users\\you\\other-project;D:\\share"
}
```

### Enable only some categories

Filter the tool list at boot by setting `AURA_ENABLED_CATEGORIES` to a comma-separated subset of the 11 tool names. To re-enable, re-spawn the server (no runtime reload):

```json
"env": { "AURA_ENABLED_CATEGORIES": "file,planner,compact" }
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_WORKSPACE` | server dir | Working directory; all filesystem / wiki / planner paths must resolve inside it. |
| `AURA_ALLOWED_PATHS` | empty | Colon (`:`) on POSIX, semicolon (`;`) on Windows. Absolute paths outside `AGENT_WORKSPACE` are allowed only if listed here. |
| `AURA_ENABLED_CATEGORIES` | all 11 | Comma-separated whitelist of tool names. Boot-time filter; no runtime reload. |
| `AURA_DISABLE_EXEC_DENYLIST` | unset | When `1`, disables the catastrophic-pattern check in `exec`. Set only if you know what you are doing. |
| `ANYTHINGLLM_API_KEY` | — | AnythingLLM API key (alternative to `api-key.json`). |
| `BRAVE_API_KEY` | — | Enables Brave Search engine for `web_search` (otherwise DuckDuckGo). |
| `RAG_PYTHON_PATH` | auto-detected | Python executable with `chromadb` installed. |
| `LM_STUDIO_CONVERSATIONS_DIR` | `~/.lmstudio/conversations` | LM Studio sessions directory (for `rag_ingest_sessions`). |
| `CHROMA_DATA_DIR` | `{server_dir}/rag/chroma_data` | ChromaDB persistence directory. |
| `OLLAMA_EMBED_URL` | `http://localhost:11434/api/embeddings` | Ollama embeddings API endpoint. |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Ollama model used for embeddings. |
| `MCP_DEBUG` | — | Set to `1` for verbose debug logging. |
| `MCP_DISABLE_AUTONOTIFY` | — | Set to `1` to suppress the desktop auto-notification. |

See [docs/env-vars.md](docs/env-vars.md) for the full table including platform-specific notes.

## Project Structure

```
aura-mcp-server/
├── SOUL.md                  # Agent personality (template — filled at first boot)
├── USER.md                  # User profile (template — filled over time)
├── MEMORY.md                # Working memory (template)
├── HELP.md                  # Quick command reference
├── TOOLS.md                 # Concise tool documentation
├── api-key.example.json     # AnythingLLM API key template
├── lm-studio-config.example.json  # MCP config template
├── install.bat / install.sh # Setup scripts
├── start.bat / start.sh     # Launch scripts
├── src/tools/               # 11 tool implementations (11 tools in 7 consolidated files)
├── src/utils/               # truncate, resultWrapper, sandbox, helpers
├── wiki-template/           # Empty wiki scaffolding (copy to your workspace)
├── docs/                    # Detailed docs (see docs/setup.md)
├── package.json
├── tsconfig.json
└── LICENSE (MIT)
```

## License

MIT

## Acknowledgments

- [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Model Context Protocol](https://modelcontextprotocol.io)
