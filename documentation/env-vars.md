# Environment Variables

AuraMCP Server reads all configuration from environment variables. They are read once at boot except for `AGENT_WORKSPACE` and the helpers in `src/utils/helpers.ts`, which resolve at call time. `AURA_ENABLED_CATEGORIES` filters `tools/list` at boot; restart the server to change it.

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

### Permission precedence

`file`/`wiki` paths must satisfy:

1. Inside `AGENT_WORKSPACE` (resolved via `resolveWorkspacePath` in `src/utils/helpers.ts`).
2. **OR** inside one of the entries of `AURA_ALLOWED_PATHS` (resolved via `resolveAllowedPath` in `src/utils/permissions.ts`).
3. **OR** inside the permission store (session scope: in-memory; always scope: persisted in `allowed-paths.json`).

Otherwise the call returns `isError: true` with a `Permission: ...` message and `pendingApproval: true`, instructing the agent to ask the user for permission.

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


## RAG (native sqlite-vec + llama.cpp embeddings)

The RAG runs **without Python**: vectors are stored in a native `sqlite-vec` index, and embeddings are produced by a CPU-only `llama.cpp` (`llama-server --embedding`) that the Node MCP server starts automatically on first use (port 11434 by default) and stops on exit.

The bundled installer downloads the `nomic-embed-text-v2-moe.Q8_0.gguf` model (~488 MB) on first launch into the per-user app data directory. When running from source, place the GGUF anywhere on disk and set `EMBED_GGUF` to its path; `llama.cpp` is vendored in `vendor/llama.cpp/<platform>/`.

| Variable | Default | Description |
|---|---|---|
| `LLAMACPP_BIN` | auto-detected | Path to the `llama-server` embedding binary (vendored). |
| `EMBED_GGUF` | auto-detected | Path to the `nomic-embed-text-v2-moe.Q8_0.gguf` model. |
| `EMBED_URL` | `http://127.0.0.1:11434` | Base URL of the local embedding server. |
| `EMBED_HOST` / `EMBED_PORT` | `127.0.0.1` / `11434` | Embedding server bind address. |
| `RAG_DATA_DIR` | `{server_dir}/rag/rag_data` | sqlite-vec vector index directory. |

## LM Studio

| Variable | Default | Description |
|---|---|---|
| `LM_STUDIO_CONVERSATIONS_DIR` | auto-detect | LM Studio sessions directory. `rag(ingest_sessions)` and `compact(action=session)` read from here. Detection order: this env var, then `~/.cache/lm-studio/conversations` (LM Studio 0.4+), then `~/.lmstudio/conversations`. |

## Local LLM (session summarization)

| Variable | Default | Description |
|---|---|---|
| `AURA_LLM_URL` | `http://localhost:1234/v1/chat/completions` | OpenAI-compatible chat endpoint used by `compact(action=session)` to generate the summary. |
| `AURA_LLM_MODEL` | chat's `lastUsedModel` | Model id for the summarization call. |
| `AURA_COMPACT_CONTEXT_LENGTH` | from chat file, else `8192` | Context window (tokens) used for the "50% over budget → summary only" check. |

## Setting on Linux/macOS

```bash
export AGENT_WORKSPACE=/path/to/workspace
export ANYTHINGLLM_API_KEY=your-key-here
```

Or in the host's MCP config (`mcpServers[*].env`):

```json
{
  "mcpServers": {
    "auramcp-server": {
      "command": "node",
      "args": ["/path/to/auramcp-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "/path/to/workspace"
      }
    }
  }
}
```

## Setting on Windows

```powershell
$env:AGENT_WORKSPACE = "C:\path\to\workspace"
```

Or in LM Studio's MCP config: `%USERPROFILE%\.lmstudio\mcp.json`.

AnythingLLM's path: `<storage>/plugins/anythingllm_mcp_servers.json`. Same `mcpServers[*].env` schema.
