#!/usr/bin/env bash
# start.sh - Launch AuraMCP Server.
# Resolves AGENT_WORKSPACE to a sibling "Workspace/" folder, falling back
# to the script directory if Workspace does not exist.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${AGENT_WORKSPACE:-}" ]; then
  if [ -d "${SCRIPT_DIR}/Workspace" ]; then
    export AGENT_WORKSPACE="${SCRIPT_DIR}/Workspace"
  else
    export AGENT_WORKSPACE="${SCRIPT_DIR}"
  fi
fi

cd "${SCRIPT_DIR}"
exec node dist/index.js "$@"
