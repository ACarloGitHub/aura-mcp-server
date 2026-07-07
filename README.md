# 🤖 AuraMCP Server

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
| 🛠️ **11 Built-in Tools** | `file`, `exec`, `exec_job`, `web_search`, `wiki`, `wiki_ingest`, `rag`, `planner`, `compact`, `anythingllm`, `notify`. |

## Requirements

- **Node.js** 18+
- **AnythingLLM** or **LM Studio** 0.3+ (with MCP support)
- **Python 3** with `chromadb` (for RAG only — optional, included via setup)

## Quick Start

### Windows

```bat
git clone https://github.com/ACarloGitHub/auramcp-server.git
cd auramcp-server
install.bat
```

### Linux / macOS / WSL

```bash
git clone https://github.com/ACarloGitHub/auramcp-server.git
cd auramcp-server
chmod +x install.sh && ./install.sh
```

### Manual

```bash
git clone https://github.com/ACarloGitHub/auramcp-server.git
cd auramcp-server
npm install
npm run build
```

Then add to your MCP config (see `lm-studio-config.example.json`):

```json
{
  "mcpServers": {
    "auramcp-server": {
      "command": "node",
      "args": ["/path/to/auramcp-server/dist/index.js"],
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

### RAG Setup

RAG runs locally with `nomic-embed-text` via `llama.cpp` (CPU-only, no CUDA required). The setup script (`install.bat` / `install.sh`) provisions both a venv with `chromadb` and a vendored `llama.cpp` runtime plus the embedding model into the project directory — nothing leaves the machine.

After the first install no further setup is needed; the server picks up `embeddings/nomic-embed-text-vX.X.X-GGUF.gguf` automatically.

## Tools

| Tool | What it does |
|------|-------------|
| `file` | Read, write, edit, or list a file in the workspace. |
| `exec` | Run shell commands (timeout, background jobs, workdir, env). |
| `exec_job` | Manage a background exec job (poll, kill, list, clean). |
| `web_search` | Web search via DuckDuckGo. |
| `wiki` | Manage the local wiki (search, read, write, list). |
| `wiki_ingest` | Advanced wiki ingest, lint, index updates. |
| `rag` | Semantic search using `nomic-embed-text` over ChromaDB collections. |
| `planner` | Create and execute phased plans with blocking questions. |
| `compact` | Memory compaction + session archiving. |
| `anythingllm` | Export chat sessions from AnythingLLM API. |
| `notify` | Desktop notification + beep when tasks complete. |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_WORKSPACE` | server dir | Working directory. All file ops scoped here. |
| `ANYTHINGLLM_API_KEY` | — | AnythingLLM API key (or use `api-key.json`) |
| `RAG_PYTHON_PATH` | auto-detected | Python executable with chromadb installed |
| `LM_STUDIO_CONVERSATIONS_DIR` | `~/.lmstudio/conversations` | LM Studio sessions directory |
| `CHROMA_DATA_DIR` | `{server_dir}/rag/chroma_data` | ChromaDB persistence directory |
| `LLAMACPP_BIN` | `{server_dir}/vendor/llama.cpp/build/bin/llama-embedding` | Path to the llama.cpp embedding binary. |
| `EMBEDDINGS_DIR` | `{server_dir}/embeddings` | Directory containing the GGUF model. |
| `MCP_DEBUG` | — | Set to `1` for verbose debug logging |

## Project Structure

```
auramcp-server/
├── SOUL.md                  # Agent personality (template — filled at first boot)
├── USER.md                  # User profile (template — filled over time)
├── MEMORY.md                # Working memory (template)
├── HELP.md                  # Quick command reference
├── TOOLS.md                 # Detailed tool documentation
├── api-key.example.json     # AnythingLLM API key template
├── lm-studio-config.example.json  # MCP config template
├── install.bat / install.sh # Setup scripts
├── start.bat / start.sh     # Launch scripts
├── src/tools/               # 11 tool implementations in 7 consolidated files
├── wiki-template/           # Empty wiki scaffolding (copy to your workspace)
├── rag/                     # ChromaDB persistence (created on first use)
├── documentation/           # Detailed docs (committed)
├── package.json
├── tsconfig.json
└── LICENSE (MIT)
```

## License

MIT

## Acknowledgments

- [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Model Context Protocol](https://modelcontextprotocol.io)
