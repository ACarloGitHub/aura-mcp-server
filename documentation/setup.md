# Installing v3.0

This document covers installing Aura MCP Server v3.0 and wiring it into either AnythingLLM or LM Studio.

## Requirements

- Node.js 18+
- AnythingLLM Desktop 1.8+ **or** LM Studio 0.3.17+
- A workspace directory (any empty folder; the agent will populate it on first boot)
- Optional: Python 3 + `chromadb` (for RAG). The embedder is the local `llama.cpp` server with a `nomic-embed-text-v1.5` GGUF downloaded by `scripts/install_embeddings.*` (only for the `rag` tool).

## Clone and Build

```bash
git clone https://github.com/ACarloGitHub/aura-mcp-server.git
cd aura-mcp-server
npm install        # or `npm ci` for a reproducible install
npm run build      # produces dist/index.js
```

### One-line installers

The repo ships platform-specific installers:

- **Windows**: run `install.bat` (creates a desktop shortcut).
- **Linux / macOS / WSL**: `chmod +x install.sh && ./install.sh`.

## Configure Workspace

Pick or create an empty workspace folder. The agent will write `SOUL.md`, `MEMORY.md`, `USER.md`, `Wiki/`, `plans/` and `compacted-sessions/` there on first boot.

```bash
mkdir -p ~/aura-workspace
```

Note this path — you'll pass it as `AGENT_WORKSPACE` in the next step.

## Wire into AnythingLLM

AnythingLLM stores its MCP server list at `<storage>/plugins/anythingllm_mcp_servers.json`. Edit (or create) that file to include:

```json
{
  "mcpServers": {
    "aura-mcp-server": {
      "command": "node",
      "args": ["W:/SviluppoProgetti/aura-mcp-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "W:/SviluppoProgetti/aura-workspace"
      }
    }
  }
}
```

Windows: paths use forward slashes for portability. AnythingLLM auto-starts MCP servers when you open the Agent Skills page or invoke `@agent`.

## Wire into LM Studio

LM Studio stores its MCP config at `~/.lmstudio/mcp.json` (or `%USERPROFILE%\.lmstudio\mcp.json` on Windows):

```json
{
  "mcpServers": {
    "aura-mcp-server": {
      "command": "node",
      "args": ["W:/SviluppoProgetti/aura-mcp-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "W:/SviluppoProgetti/aura-workspace"
      }
    }
  }
}
```

LM Studio reads the file whenever you save it. Tools appear under the Program tab and the model's chat confirms via a confirmation dialog before each call.

## First Boot

1. Open the host's agent or chat UI.
2. The model reads `SOUL.md` and asks for name, language, what you want to do.
3. Begin a chat. Tool calls appear as cards with arguments; LM Studio and AnythingLLM both show a confirmation dialog before each invocation.

## Updating

```bash
cd aura-mcp-server
git pull
npm ci
npm run build
```

Then restart the host application (or just close and reopen the Agent Skills page in AnythingLLM).

## Troubleshooting

- **Server does not start**: check stderr for `Aura MCP Server v3.0 started on stdio`. If you don't see that line within a few seconds of opening the host, the path or env is wrong.
- **`Unknown tool: <name>`**: the host is calling a v2.x granular name. Hosts update automatically when they reload the descriptor list; just close and reopen the agent panel.
- **`Sandbox: Path outside AGENT_WORKSPACE ...`**: the model tried to read or write outside the workspace. Either fix the prompt or add the path to `AURA_ALLOWED_PATHS`.
- **DuckDuckGo CAPTCHA**: rare; wait a few minutes before retrying.
- **RAG fails with `chromadb not found`**: install with `pip install chromadb`. Confirm the python that owns the package matches `RAG_PYTHON_PATH`.
