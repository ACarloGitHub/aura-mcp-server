#!/usr/bin/env bash
# Avvia Aura MCP Server su Unix/WSL/Mac
# AGENT_WORKSPACE punta alla cartella del server (dove si trovano SOUL.md, MEMORY.md, ecc.)
# Per usare una cartella workspace diversa: export AGENT_WORKSPACE=/path/to/workspace

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Default: usa la cartella del server come workspace.
# Sovrascrivi con: export AGENT_WORKSPACE=/percorso/workspace
if [ -z "$AGENT_WORKSPACE" ]; then
  export AGENT_WORKSPACE="$SCRIPT_DIR"
fi

cd "$SCRIPT_DIR" || exit 1
exec node dist/index.js
