# 🤖 Aura MCP Server

A powerful [MCP](https://modelcontextprotocol.io) server for [AnythingLLM](https://anythingllm.com) and [LM Studio](https://lmstudio.ai) that gives your local LLM persistent memory, semantic search, a structured wiki, planner, session compaction, desktop notifications and direct AnythingLLM integration — all local, all private.

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-5_min-4299E1?style=for-the-badge" alt="Quick Start"></a>
  <a href="#-requirements"><img src="https://img.shields.io/badge/Requirements-Node.js%2018%2B-48BB78?style=for-the-badge" alt="Requirements"></a>
  <a href="#-privacy"><img src="https://img.shields.io/badge/Privacy-100%25_Local-E53E3E?style=for-the-badge" alt="Privacy"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-F6E05E?style=for-the-badge" alt="License"></a>
  <a href="https://www.patreon.com/cw/PatataLab"><img src="https://img.shields.io/badge/Patreon-Support-FF424D?style=for-the-badge&logo=patreon&logoColor=white" alt="Patreon"></a>
  <a href="https://buymeacoffee.com/patatalab"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%23FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/typescript-5.0+-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/node.js-18+-green?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/MCP_SDK-1.0-8B5CF6" alt="MCP SDK">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS%20%7C%20WSL-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/Privacy-Local%20Only-red" alt="Privacy">
</p>

## Features

| | |
|---|---|
| 🧬 **Personality** | `SOUL.md` defines who the agent is. First boot asks for name, role and language. |
| 📝 **Memory** | `MEMORY.md` for session notes. Auto-compacts when >300 lines. |
| 👤 **User Profile** | `USER.md` for preferences, filled in over time. |
| 📚 **Wiki** | Full [Karpathy-style wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) with summaries, concepts, entities, syntheses. |
| 📋 **Planner** | Phased project plans with checklists and blocking questions. |
| 📦 **Session Compaction** | Compact long conversations into summaries. Start fresh without losing context. |
| 🔎 **RAG** | Semantic search via ChromaDB over sessions and auto-extracted entities. |
| 💬 **AnythingLLM** | Export chat sessions directly from AnythingLLM API. |
| 🔔 **Notifications** | Desktop notifications + beep when the agent completes tasks (Windows/Linux/macOS). |
| 🛠️ **13 Built-in Tools** | `exec`, `read`, `write`, `edit`, `list_dir`, `web_search`, `wiki`, `wiki_ingest`, `rag`, `planner`, `compact`, `anythingllm`, `notify`. |

## Requirements

- **Node.js** 18+
- **AnythingLLM** or **LM Studio** 0.3+ (with MCP support)
- **Python 3** with `chromadb` and `llama-cpp-python` (for RAG only — optional)

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

**Windows paths** use double backslashes: `"C:\\\\Users\\\\you\\\\workspace"`.

Restart AnythingLLM / LM Studio. The server connects automatically.

## Configuration

### AnythingLLM API (optional)

To use the `anythingllm` tool (chat export), create `api-key.json` from the template:

```bash
cp api-key.example.json api-key.json
# Edit api-key.json and insert your AnythingLLM API key
```

Get your key from AnythingLLM → Settings → API Keys.

You can also set it via environment variable: `ANYTHINGLLM_API_KEY=your-key`.

### RAG Setup (optional)

For semantic search, install Python dependencies:

```bash
pip install chromadb llama-cpp-python
```

Then download an embedding model:

```bash
mkdir -p models
wget -O models/nomic-embed-text-v1.5.Q8_0.gguf \
  https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q8_0.gguf
```

The RAG engine loads the model directly — no external server required.

## Tools

| Tool | What it does |
|------|-------------|
| `exec` | Run shell commands (timeout, background jobs, workdir, env) |
| `read` | Read text files or images (jpg, png, gif, webp) |
| `write` | Write files, auto-creates parent directories |
| `edit` | Edit existing files with find-and-replace (multi-param support) |
| `list_dir` | List directory contents, skips hidden files |
| `web_search` | Search via DuckDuckGo (free) or Brave API |
| `wiki` | Search, read, write, list wiki pages |
| `wiki_ingest` | Advanced wiki management (ingest, lint, update index) |
| `rag` | Semantic search (ChromaDB + local GGUF embeddings) |
| `planner` | Create and execute phased plans with blocking questions |
| `compact` | Memory compaction + session archiving |
| `anythingllm` | Export chat sessions from AnythingLLM API (list/export/export-all) |
| `notify` | Desktop notification + beep when tasks complete |

AnythingLLM compatibility aliases are also registered: `filesystem-read-text-file`, `filesystem-write-text-file`, `filesystem-edit-text-file`, `filesystem-list-directory`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_WORKSPACE` | parent of server dir | Working directory. All file ops scoped here. |
| `ANYTHINGLLM_API_KEY` | — | AnythingLLM API key (or use `api-key.json`) |
| `BRAVE_API_KEY` | — | Optional Brave Search API key |
| `RAG_PYTHON_PATH` | auto-detected | Python executable with chromadb installed |
| `LM_STUDIO_CONVERSATIONS_DIR` | `~/.lmstudio/conversations` | LM Studio sessions directory |
| `CHROMA_DATA_DIR` | `{WORKSPACE}/rag/chroma_data` | ChromaDB persistence directory |
| `EMBEDDING_MODEL_PATH` | `{WORKSPACE}/models/nomic-embed-text-v1.5.Q8_0.gguf` | Path to GGUF embedding model |
| `MCP_DEBUG` | — | Set to `1` for verbose debug logging |

## Project Structure

```
aura-mcp-server/
├── SOUL.md                  # Agent personality (template — filled at first boot)
├── USER.md                  # User profile (template — filled over time)
├── MEMORY.md                # Working memory (template)
├── HELP.md                  # Quick command reference
├── TOOLS.md                 # Detailed tool documentation
├── api-key.example.json     # AnythingLLM API key template
├── lm-studio-config.example.json  # MCP config template
├── install.bat / install.sh # Setup scripts
├── start.bat / start.sh     # Launch scripts
├── src/tools/               # 13 tool implementations
├── wiki-template/           # Empty wiki scaffolding (copy to your workspace)
├── docs/                    # Detailed docs
│   ├── setup.md
│   ├── first-boot.md
│   ├── architecture.md
│   ├── wiki.md
│   ├── planner.md
│   ├── compaction.md
│   └── env-vars.md
├── package.json
├── tsconfig.json
└── LICENSE (MIT)
```

## License

MIT

## Acknowledgments

- [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Model Context Protocol](https://modelcontextprotocol.io)
