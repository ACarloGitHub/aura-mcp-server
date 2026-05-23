@echo off
setlocal
REM Avvia Aura MCP Server su Windows
REM AGENT_WORKSPACE punta alla cartella del server (dove si trovano SOUL.md, MEMORY.md, ecc.)
REM Per usare una cartella workspace diversa: impostare AGENT_WORKSPACE prima di eseguire

set "SCRIPT_DIR=%~dp0"

REM Default: usa la cartella del server come workspace.
REM Rimuovi il backslash finale da SCRIPT_DIR
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Sovrascrivi con: set AGENT_WORKSPACE=C:\percorso\workspace
if not defined AGENT_WORKSPACE (
  set "AGENT_WORKSPACE=%SCRIPT_DIR%"
)

cd /d "%SCRIPT_DIR%"
node dist/index.js
