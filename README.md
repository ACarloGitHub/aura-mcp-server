# 🧠 LM Studio Agent Server

An [MCP](https://modelcontextprotocol.io) server for [LM Studio](https://lmstudio.ai) that gives your local LLM persistent memory, semantic search, a structured wiki, planner, and session compaction — all local, all private.

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-5_min-4299E1?style=for-the-badge" alt="Quick Start"></a>
  <a href="#-requirements"><img src="https://img.shields.io/badge/Requirements-Node.js%2018%2B-48BB78?style=for-the-badge" alt="Requirements"></a>
  <a href="#-privacy"><img src="https://img.shields.io/badge/Privacy-100%25_Local-E53E3E?style=for-the-badge" alt="Privacy"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-F6E05E?style=for-the-badge" alt="License"></a>
  <a href="https://www.patreon.com/c/PatataLab"><img src="https://img.shields.io/badge/Patreon-Support-FF424D?style=for-the-badge&logo=patreon&logoColor=white" alt="Patreon"></a>
  <a href="https://buymeacoffee.com/patatalab"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%23FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/typescript-5.0+-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/node.js-18+-green?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/MCP_SDK-1.0-8B5CF6" alt="MCP SDK">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/Privacy-Local%20Only-red?logo=privacy-essentials" alt="Privacy">
</p>

## Features

| | |
|---|---|
| 🧬 **Personality** | `SOUL.md` defines who the agent is. First boot asks for name and role. |
| 📝 **Memory** | `MEMORY.md` for session notes. Auto-compacts when >300 lines. |
| 👤 **User Profile** | `USER.md` for preferences, filled in over time. |
| 📚 **Wiki** | Full [Karpathy-style wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) with summaries, concepts, entities, syntheses. |
| 📋 **Planner** | Phased project plans with checklists and blocking questions. |
| 📦 **Session Compaction** | Compact long conversations into summaries. Start fresh without losing context. |
| 🔎 **RAG** | Semantic search via ChromaDB over sessions and auto-extracted entities. |
| 🛠️ **9 Built-in Tools** | `exec`, `read`, `write`, `web_search`, `wiki`, `wiki_ingest`, `rag`, `planner`, `compact`. |

## Requirements

- **Node.js** 18+
- **LM Studio** 0.3+ (with MCP support)
- **Python 3** with `chromadb` and `llama-cpp-python` (for RAG)

### RAG Setup

For semantic search (RAG), install the Python dependencies:

```bash
pip install chromadb llama-cpp-python
```

Then download an embedding model:

```bash
# Create models directory
mkdir -p models

# Download nomic-embed-text-v1.5 Q8_0 (140MB, CPU-friendly)
wget -O models/nomic-embed-text-v1.5.Q8_0.gguf \
  https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q8_0.gguf
```

The RAG engine loads the model directly — no external server required.  
See [Environment Variables](#environment-variables) for the `EMBEDDING_MODEL_PATH` option.

### Entity Extraction (Optional)

Entity extraction requires **Ollama** running on `http://localhost:11434` with a chat model (e.g., `deepseek-v4-flash:cloud`).  
If Ollama is not available, entity extraction is silently skipped — RAG search still works fine.

## Quick Start

```bash
git clone https://github.com/yourusername/lm-studio-agent-server.git
cd lm-studio-agent-server
npm install
```

Then add to LM Studio's MCP config (`~/.lmstudio/mcp.json`):

```json
{
  "mcpServers": {
    "agent-server": {
      "command": "node",
      "args": ["/path/to/lm-studio-agent-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "/path/to/lm-studio-agent-server"
      }
    }
  }
}
```

Restart LM Studio. The server connects automatically.

## Tools

| Tool | What it does |
|------|-------------|
| `exec` | Run shell commands (timeout, workdir, env, background) |
| `read` | Read text files or images (jpg, png, gif, webp) |
| `write` | Write files, auto-creates parent directories |
| `web_search` | Search via DuckDuckGo (free) or Brave API |
| `wiki` | Search, read, write, list wiki pages |
| `wiki_ingest` | Advanced wiki management (ingest, lint, update) |
| `rag` | Semantic search (ChromaDB + nomic embeddings) |
| `planner` | Create and execute phased plans |
| `compact` | Memory compaction + session compaction |

### compact

Two modes:

- **`compact action=memory`** — Auto-archives `MEMORY.md` when it exceeds 300 lines. Old content goes to `memory-archive.md`, MEMORY.md keeps the header + fresh Notes section. Run without asking — routine maintenance.

- **`compact action=session session="Folder/file.conversation.json"`** — Compacts a long LM Studio session. The tool reads the `.conversation.json`, summarizes via the model, and saves to `compacted-sessions/` as a markdown file. **Not indexed in RAG** — just a file the model reads when recovering context in a new session.

Use `compact action=status` to check memory state, `compact action=list` to see compacted sessions.

### planner

```
planner action=create name=MyPlan content="..."
planner action=read name=MyPlan
planner action=list
planner action=next name=MyPlan
planner action=next name=MyPlan answer="my response"
```

Plans support checklists (`- [ ] task`), phases (`### Phase 1`), and blocking questions (`- [ ] Question for user: ...`).

### rag

```
rag action=search collection=sessions query="neural networks"
rag action=search collection=entities query="Python"
rag action=collections
```

Sessions are indexed in RAG when added via `rag add` or `ingest_sessions`. Entities are automatically extracted from sessions in a background thread — no extra steps needed. If auto-extraction failed, run `rag action=extract_entities collection=sessions` manually.

### wiki_ingest

```
wiki_ingest action=lint
wiki_ingest action=update_index
wiki_ingest action=ingest source="raw/document.md"
```

Follows the [Karpathy wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): raw sources → agent creates summaries, concepts, entities → cross-linked in index.md.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_WORKSPACE` | `.` | Working directory. All file ops scoped here. |
| `BRAVE_API_KEY` | — | Optional Brave Search API key |
| `LM_STUDIO_URL` | `http://localhost:1234` | LM Studio server URL |
| `LM_STUDIO_CONVERSATIONS_DIR` | `~/.lmstudio/conversations` | LM Studio sessions directory |
| `CHROMA_DATA_DIR` | `{WORKSPACE}/rag/chroma_data` | ChromaDB persistence |
| `SESSION_EXPORT_DIR` | `{WORKSPACE}/session-exports` | Session export output |
| `EMBEDDING_MODEL_PATH` | `{WORKSPACE}/models/nomic-embed-text-v1.5.Q8_0.gguf` | Path to the GGUF embedding model |

## Project Structure

```
lm-studio-agent-server/
├── SOUL.md              # Agent personality
├── USER.md              # User profile
├── MEMORY.md            # Working memory
├── HELP.md              # Quick command reference
├── src/tools/           # 11 tool implementations
│   ├── compact.ts       # Memory + session compaction
│   ├── planner.ts       # Phased plans
│   ├── rag.ts           # RAG frontend
│   ├── wiki_ingest.ts   # Advanced wiki management
│   ├── rag.py           # ChromaDB backend
│   ├── session_export.py
│   └── ...
├── wiki-template/       # Empty wiki scaffolding
├── docs/                # Detailed docs
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

## Screenshots

*(Coming soon)*

## License

MIT

## Acknowledgments

- [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Model Context Protocol](https://modelcontextprotocol.io)
