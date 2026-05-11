@echo off
setlocal
REM Avvia Aura MCP Server su Windows
REM Assumes che questo file sia nella cartella mcp-server/

set "SCRIPT_DIR=%~dp0"
set "AGENT_WORKSPACE=%SCRIPT_DIR%.."

cd /d "%SCRIPT_DIR%"
node dist/index.js
