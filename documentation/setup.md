# Setup

This document covers installing AuraMCP Server and wiring it into a host
application (AnythingLLM Desktop or LM Studio).

> **Primary path**: the bundled installer. Download from
> [GitHub Releases](https://github.com/ACarloGitHub/aura-mcp-server/releases),
> run it, follow the first-launch dialog. The installer handles everything
> (embedding model download, server registration, system tray).
>
> **Secondary path**: run from source. Documented at the bottom of this file,
> for developers and contributors.

## Requirements

- **Node.js 18+** — only required for the "run from source" path. The
  bundled installer embeds Node.js spawning logic but still requires a
  Node.js runtime to be present on the host machine for the MCP server
  child process.
- **AnythingLLM Desktop 1.8+** or **LM Studio 0.3.17+**.
- **A workspace directory** (any empty folder; the agent populates it
  on first boot).

## Primary path: bundled installer

### 1. Download

Grab the latest release for your platform from
[GitHub Releases](https://github.com/ACarloGitHub/aura-mcp-server/releases/latest):

- **Windows**: `AuraMCP_3.1.0_x64-setup.exe` (NSIS, recommended) or
  `AuraMCP_3.1.0_x64_en-US.msi` (WiX).
- **macOS**: `AuraMCP_3.1.0_universal.dmg` (Intel + Apple Silicon).
- **Linux**: `AuraMCP_3.1.0_amd64.deb` (Debian/Ubuntu) or
  `AuraMCP-3.1.0-1.x86_64.rpm` (Fedora/RHEL).

### 2. Install

Run the installer. It registers AuraMCP in the system and adds a tray
icon. No further user action needed at this point.

### 3. First launch

The first time `AuraMCP` starts it shows a one-time setup dialog asking
to download the embedding model (~488 MB). The model is the
[nomic-embed-text-v2-moe.Q8_0](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF)
GGUF and is fetched from Hugging Face into the per-user app data
directory:

- Windows: `%APPDATA%\com.auramcp.server\embeddings\`
- macOS: `~/Library/Application Support/com.auramcp.server/embeddings/`
- Linux: `~/.local/share/com.auramcp.server/embeddings/`

After confirming, the server starts in the tray. The download is
~488 MB and takes a few minutes on a typical connection. RAG is fully
operational only after this completes; the other 10 tools work
immediately.

> **Privacy**: the download is the only outbound network call. After
> that, embeddings are produced by the bundled `llama.cpp` running on
> `127.0.0.1:11434`. No telemetry, no third-party API calls.

### 4. Wire into your MCP host

The installer creates `dist/index.js` and (on Windows / macOS) registers
the launcher. You still need to tell your MCP host to spawn it. See
[Wire into AnythingLLM](#wire-into-anythingllm) or
[Wire into LM Studio](#wire-into-lm-studio) below.

## Wire into AnythingLLM

AnythingLLM stores its MCP server list at
`<storage>/plugins/anythingllm_mcp_servers.json`.

`<storage>` depends on the platform:

- **Windows**: `%APPDATA%\anythingllm-desktop\storage\`
- **macOS**: `~/Library/Application Support/anythingllm-desktop/storage/`
- **Linux**: `~/.local/share/anythingllm-desktop/storage/`

Edit (or create) the file:

```json
{
  "mcpServers": {
    "auramcp-server": {
      "command": "node",
      "args": ["/path/to/aura-mcp-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "/path/to/your/workspace"
      }
    }
  }
}
```

Replace `/path/to/aura-mcp-server` with the directory where the
installer placed the project (or where you cloned it), and
`/path/to/your/workspace` with an empty directory of your choice.

AnythingLLM's MCP Management UI (Settings → MCP Servers) shows all
detected servers, their status, error logs and lets you reload or
restart them. If the server appears in the UI but tools are missing,
reload it from the UI to re-read the file.

To prevent AnythingLLM from auto-starting the server (useful on
resource-constrained machines), add:

```json
{
  "mcpServers": {
    "auramcp-server": {
      "command": "node",
      "args": ["/path/to/aura-mcp-server/dist/index.js"],
      "env": { "AGENT_WORKSPACE": "/path/to/your/workspace" },
      "anythingllm": { "autoStart": false }
    }
  }
}
```

## Wire into LM Studio

LM Studio stores its MCP config at:

- **Windows**: `%USERPROFILE%\.lmstudio\mcp.json`
- **macOS / Linux**: `~/.lmstudio/mcp.json`

LM Studio 0.3.17+ also exposes an in-app editor: **Program tab →
Install → Edit mcp.json**. Either edit via the UI or the file directly.

```json
{
  "mcpServers": {
    "auramcp-server": {
      "command": "node",
      "args": ["/path/to/aura-mcp-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "/path/to/your/workspace"
      }
    }
  }
}
```

LM Studio auto-reloads the file whenever you save it. Tools appear
under the Program tab; the model's chat shows a confirmation dialog
before each tool call.

> **Gotcha**: when pasting manually, copy only the content **after**
> `"mcpServers": {` and **before** the closing `}`. LM Studio merges
> into the existing top-level key, so a full copy would create a
> nested `mcpServers` that doesn't work.

## First Boot

After the host is connected, open its chat UI. The model reads
`SOUL.md` from the workspace and asks for your name, language, and what
you want to do. Begin a chat — tool calls appear as cards with
arguments; both AnythingLLM and LM Studio show a confirmation dialog
before each invocation.

## Updating

Grab the new installer from
[GitHub Releases](https://github.com/ACarloGitHub/aura-mcp-server/releases/latest)
and run it over the previous install. The installer preserves your
workspace and embedding model.

To update from a source checkout:

```bash
git pull
npm install
npm run build
```

Then restart the host application (or close and reopen the MCP panel).

## Troubleshooting

- **Server does not start** — open the host's MCP panel and check the
  error log. Most common cause: wrong path in `args` or missing Node.js.
- **Unknown tool: \<name\>** — the host cached an old tool list. Close
  and reopen the MCP panel.
- **Sandbox: Path outside AGENT_WORKSPACE** — the model tried to read
  or write outside the workspace. Either fix the prompt or add the path
  to `AURA_ALLOWED_PATHS`.
- **DuckDuckGo CAPTCHA** — rare; wait a few minutes before retrying.
- **RAG fails: embedding backend not found** — open the system tray
  icon, choose "Restart". If the embedding model is missing, the
  setup dialog re-appears on next launch.
- **RAG returns no results** — verify the embedding model is present
  in the per-user app data directory (see step 3 above). The Node
  server starts the embedding backend on first `rag` tool call and
  stops it on exit.

## Secondary path: run from source

```bash
git clone https://github.com/ACarloGitHub/aura-mcp-server.git
cd aura-mcp-server
npm install
npm run build
node dist/index.js
```

The server reads `AGENT_WORKSPACE` from the environment (or falls back
to the current working directory). Point your MCP host at the
`dist/index.js` file as described above.

This path is intended for development and CI; the bundled installer
is the supported way for end users.

## See also

- [architecture.md](architecture.md) — pipeline and tool surface.
- [env-vars.md](env-vars.md) — every environment variable, with
  precedence rules.
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — version history.