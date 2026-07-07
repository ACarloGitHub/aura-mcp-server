@echo off
setlocal
REM start.bat - Launch AuraMCP Server.
REM Resolves AGENT_WORKSPACE to a sibling "Workspace\" folder, falling back
REM to the script directory if Workspace does not exist.

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

if not defined AGENT_WORKSPACE (
    if exist "%SCRIPT_DIR%\Workspace" (
        set "AGENT_WORKSPACE=%SCRIPT_DIR%\Workspace"
    ) else (
        set "AGENT_WORKSPACE=%SCRIPT_DIR%"
    )
)

cd /d "%SCRIPT_DIR%"
node dist\index.js
