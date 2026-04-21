# Available Tools

Scripts and utilities available in `./tools/`

## MCP Tools (Built-in)

These tools are provided by the MCP server and available to the agent:

- `exec` — Execute shell commands with timeout, working directory, and background support.
- `read` — Read text files or images (jpg, png, gif, webp).
- `write` — Write files, creating parent directories automatically.
- `web_search` — Web search via DuckDuckGo (free) or Brave API.
- `wiki` — Manage the local LLM wiki (search, read, write, list).

## Shell Scripts

Place shell scripts in `./tools/` and the agent can invoke them via `exec`.

## Python Scripts

Place Python scripts in `./tools/` and the agent can invoke them via `exec`.

## Rules

- **Always wait for explicit user permission** before executing any script that modifies files outside the agent's workspace.
- The agent workspace is the directory where the MCP server is configured to run.
