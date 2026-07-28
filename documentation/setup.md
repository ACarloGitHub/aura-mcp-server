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

- **Nothing.** The installer bundles the **Node.js LTS runtime** — no
  user-side Node.js install required.
- **AnythingLLM Desktop 1.8+** or **LM Studio 0.3.17+**.
- **A workspace directory** (any empty folder; the agent populates it
  on first boot).

## Primary path: bundled installer

### 1. Download

Grab the latest release for your platform from
[GitHub Releases](https://github.com/ACarloGitHub/aura-mcp-server/releases/latest):

- **Windows**: `AuraMCP_x64-setup.exe` (NSIS, recommended) or
  `AuraMCP_x64_en-US.msi` (WiX).
- **macOS**: `AuraMCP_universal.dmg` (Intel + Apple Silicon).
- **Linux**: `AuraMCP_amd64.deb` (Debian/Ubuntu) or
  `AuraMCP_x86_64.rpm` (Fedora/RHEL).

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

The installer bundles the Node.js LTS runtime and registers the
launcher. On startup, AuraMCP **auto-detects** LM Studio and writes
the correct MCP config automatically — no manual editing needed.

If auto-registration is not available (e.g. the host is installed
after AuraMCP, or you use a different MCP client), see
[Wire into AnythingLLM](#wire-into-anythingllm) or
[Wire into LM Studio](#wire-into-lm-studio) below.

## Wire into AnythingLLM

AnythingLLM stores its MCP server list at
`<storage>/plugins/anythingllm_mcp_servers.json`.

`<storage>` depends on the platform:

- **Windows**: `%APPDATA%\anythingllm-desktop\storage\`
- **macOS**: `~/Library/Application Support/anythingllm-desktop/storage/`
- **Linux**: `~/.local/share/anythingllm-desktop/storage/`

Edit (or create) the file — use the AuraMCP executable with `--serve`:

```json
{
  "mcpServers": {
    "auramcp-server": {
      "command": "C:\\path\\to\\AuraMCP.exe",
      "args": ["--serve"],
      "env": {
        "AGENT_WORKSPACE": "C:\\path\\to\\your\\workspace"
      }
    }
  }
}
```

Replace `C:\\path\\to\\AuraMCP.exe` with the actual install path (shown
in the AuraMCP control panel under the AnythingLLM tab), and
`AGENT_WORKSPACE` with an empty directory of your choice.

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
      "command": "C:\\path\\to\\AuraMCP.exe",
      "args": ["--serve"],
      "env": { "AGENT_WORKSPACE": "C:\\path\\to\\your\\workspace" },
      "anythingllm": { "autoStart": false }
    }
  }
}
```

## Wire into LM Studio

LM Studio stores its MCP config at:

- **Windows**: `%USERPROFILE%\.cache\lm-studio\mcp.json`
- **macOS / Linux**: `~/.cache/lm-studio/mcp.json`

> **Auto-registration**: on launch, AuraMCP detects LM Studio and
> writes this file automatically. The section below is for manual
> configuration only.

LM Studio 0.3.17+ also exposes an in-app editor: **Program tab →
Install → Edit mcp.json**. Either edit via the UI or the file directly.

```json
{
  "mcpServers": {
    "auramcp-server": {
      "command": "C:\\path\\to\\AuraMCP.exe",
      "args": ["--serve"],
      "env": {
        "AGENT_WORKSPACE": "C:\\path\\to\\your\\workspace"
      }
    }
  }
}
```

Replace `C:\\path\\to\\AuraMCP.exe` with the actual install path (shown
in the AuraMCP control panel under the LM Studio tab), and
`AGENT_WORKSPACE` with an empty directory of your choice.

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

## Uninstall

Uninstall behaviour differs by platform. The AuraMCP Control Panel's
**Uninstall AuraMCP…** button automates the workflow where possible
(Windows only); for macOS / Linux follow the steps below.

### Windows

The MSI / NSIS installers register an uninstaller with Windows:

- **Settings → Apps → Installed apps → AuraMCP → Uninstall**, or
- **Control Panel → Programs and Features → AuraMCP → Uninstall**

You can also launch it from the Control Panel or by running
`<install_dir>\uninstall.exe` (where `<install_dir>` is shown at the
bottom of the AuraMCP window).

The uninstaller removes the launcher, the bundled llama.cpp binaries,
the tray icon, and the start-menu entry. **Your workspace and the
downloaded embedding model are kept by default.** At the end of
uninstall a dialog asks whether to also delete
`%APPDATA%\com.auramcp.server\` — choose **Yes** for a complete clean,
**No** if you plan to reinstall later.

To remove the data manually afterwards, delete the directory:

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\com.auramcp.server"
```

### macOS

There is no dedicated uninstaller bundle. To uninstall:

1. Quit AuraMCP from the tray menu (Quit AuraMCP).
2. Move `AuraMCP.app` from `/Applications` to the Trash.
3. Empty the Trash.
4. Optionally remove your per-user data:

```bash
rm -rf "$HOME/Library/Application Support/com.auramcp.server"
```

### Linux

The `.deb` and `.rpm` packages register with the system package manager.

- **Debian / Ubuntu**: `sudo apt remove auramcp` (keeps config) or
  `sudo apt purge auramcp` (also removes config from `/etc`).
- **Fedora / RHEL**: `sudo dnf remove auramcp`.

The packages do **not** touch `~/.local/share/com.auramcp.server/`
(per-user data — the workspace, embedding model, RAG index, logs).
To remove it:

```bash
rm -rf "$HOME/.local/share/com.auramcp.server"
```

### What gets removed vs kept

| Path | Removed by uninstaller? |
|---|---|
| Application binary + bundled llama.cpp + tray / start-menu entries | **Yes** (all platforms) |
| Tray / start-menu entries | **Yes** (Windows) |
| `<install_dir>/dist/index.js` | **Yes** (all platforms) |
| Workspace (`MEMORY.md`, `Wiki/`, `plans/`, `compacted-sessions/`) | **No** by default — manual cleanup required |
| Downloaded embedding model (`nomic-embed-text-v2-moe.Q8_0.gguf`, ~488 MB) | **No** by default — manual cleanup required |
| RAG sqlite-vec index | **No** by default — manual cleanup required |
| `mcp-server.log` | **No** by default — manual cleanup required |

The default behaviour preserves your data so a future reinstall can
reuse the embedding model (saving the ~488 MB download) and any
workspace state.

## Troubleshooting

- **Server does not start** — open the host's MCP panel and check the
  error log. If running manually, verify the path in `command` points
  to the installed `AuraMCP.exe` and that `--serve` is in `args`.
- **Unknown tool: \<name\>** — the host cached an old tool list. Close
  and reopen the MCP panel.
- **Permission: Path outside AGENT_WORKSPACE** — the model tried to read
  or write outside the workspace. The server returns a `pendingApproval`
  message. The agent should ask the user for permission, then use the
  `permissions` tool to grant access. Alternatively, add the path to
  `AURA_ALLOWED_PATHS`.
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
```

You can then either run the Node server directly:

```bash
node dist/index.js
```

or launch the Tauri desktop launcher in dev mode:

```bash
npm run tauri dev
```

The server reads `AGENT_WORKSPACE` from the environment (or falls back
to the current working directory). Point your MCP host at
`dist/index.js` (direct node) or at the dev binary with `--serve`
(Tauri dev mode).

This path is intended for development and CI; the bundled installer
is the supported way for end users.

## See also

- [architecture.md](architecture.md) — pipeline and tool surface.
- [env-vars.md](env-vars.md) — every environment variable, with
  precedence rules.
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — version history.