# Environment Variables

Aura MCP Server reads all configuration from environment variables. They are read once at boot except for `AGENT_WORKSPACE` and the helpers in `src/utils/helpers.ts`, which resolve at call time. `AURA_ENABLED_CATEGORIES` filters `tools/list` at boot; restart the server to change it.

## Server

| Variable | Default | Description |
|---|---|---|
| `AGENT_WORKSPACE` | server dir | Working directory. All file and wiki operations are anchored here. Path must exist or be creatable on first run. |
| `AURA_ALLOWED_PATHS` | empty | Opt-in absolute paths outside `AGENT_WORKSPACE` that `file`/`wiki` may touch. Separator: `:` on POSIX, `;` on Windows. Whitespace is trimmed. |
| `AURA_ENABLED_CATEGORIES` | all 11 tool names | Comma-separated whitelist of tool names. Categories not listed are omitted from `tools/list`. Boot-time filter; no runtime reload. To re-enable, re-spawn the server. |
| `AURA_DISABLE_EXEC_DENYLIST` | unset | When `1`, the catastrophic-pattern check on `exec` is skipped. Set only if you know what you are doing. |
| `MCP_DEBUG` | unset | When `1`, the server logs every tool call's name and elapsed ms to stderr. |
| `MCP_DISABLE_AUTONOTIFY` | unset | When `1`, suppresses the desktop auto-notification after every tool call. |
| `MCP_LOG_MAX_MB` | `10` | Soft cap on the `mcp-server.log` file before rotation. |

### Sandbox precedence

`file`/`wiki` paths must satisfy:

1. Inside `AGENT_WORKSPACE` (resolved via `resolveWorkspacePath` in `src/utils/helpers.ts`).
2. **OR** inside one of the entries of `AURA_ALLOWED_PATHS` (resolved via `resolveAllowedPath` in `src/utils/sandbox.ts`).

Otherwise the call returns `isError: true` with a `Sandbox: ...` message.

## AnythingLLM

| Variable | Default | Description |
|---|---|---|
| `ANYTHINGLLM_API_KEY` | — | API key for the AnythingLLM instance. Overrides `api-key.json`. |
| `ANYTHINGLLM_BASE_URL` | `http://localhost:3001/api/v1` | AnythingLLM API root. |

### Precedence

1. `apiKey` argument on the call.
2. `ANYTHINGLLM_API_KEY` env var.
3. `api-key.json` in the server directory (then the workspace directory as fallback).

## Web search

| Variable | Default | Description |
|---|---|---|
| `BRAVE_API_KEY` | unset | Brave Search API key. If set, `web_search(engine=brave)` is honored; if not, DuckDuckGo (free) is used. |

## RAG (ChromaDB + Ollama)

| Variable | Default | Description |
|---|---|---|
| `RAG_PYTHON_PATH` | auto-detected | Python executable with `chromadb` installed. Auto-detection looks for `.venv/Scripts/python.exe` (Win) or `.venv/bin/python3` (POSIX) before searching `PATH`. |
| `CHROMA_DATA_DIR` | `{server_dir}/rag/chroma_data` | Persisted ChromaDB store. |
| `OLLAMA_EMBED_URL` | `http://localhost:11434/api/embeddings` | Ollama embeddings endpoint. |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Ollama model used to produce embeddings. |

## LM Studio

| Variable | Default | Description |
|---|---|---|
| `LM_STUDIO_CONVERSATIONS_DIR` | `~/.lmstudio/conversations` | LM Studio sessions directory. `rag(ingest_sessions)` reads from here. |

## Setting on Linux/macOS

```bash
export AGENT_WORKSPACE=/path/to/workspace
export BRAVE_API_KEY=your-key-here
export ANYTHINGLLM_API_KEY=your-key-here
```

Or in the host's MCP config (`mcpServers[*].env`):

```json
{
  "mcpServers": {
    "aura-mcp-server": {
      "command": "node",
      "args": ["/path/to/aura-mcp-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "/path/to/workspace",
        "BRAVE_API_KEY": "your-key-here"
      }
    }
  }
}
```

## Setting on Windows

```powershell
$env:AGENT_WORKSPACE = "C:\path\to\workspace"
$env:BRAVE_API_KEY = "your-key-here"
```

Or in LM Studio's MCP config: `%USERPROFILE%\.lmstudio\mcp.json`.

AnythingLLM's path: `<storage>/plugins/anythingllm_mcp_servers.json`. Same `mcpServers[*].env` schema.
