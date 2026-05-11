#!/usr/bin/env bash
# Avvia Aura MCP Server su Unix/WSL/Mac
# Assumes che questo file sia nella cartella mcp-server/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export AGENT_WORKSPACE="$(dirname "$SCRIPT_DIR")"

cd "$SCRIPT_DIR" || exit 1
exec node dist/index.js
