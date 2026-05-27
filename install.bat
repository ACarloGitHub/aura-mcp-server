@echo off
setlocal EnableDelayedExpansion
REM install.bat — Automatic MCP server setup on Windows
REM Usage: double-click or run from cmd in the mcp-server/ folder

echo =========================================
echo  Aura MCP Server — Installation
echo =========================================
echo.

REM Verifica Node.js
node --version > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Download from https://nodejs.org/ (LTS recommended)
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('node --version') do set NODE_VER=%%a
echo [OK] Node.js found: %NODE_VER%

REM Verifica npm
npm --version > nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found.
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('npm --version') do set NPM_VER=%%a
echo [OK] npm found: %NPM_VER%

echo.
echo [INFO] Checking Python...
echo.
python --version > nul 2>&1
if errorlevel 1 (
    echo [WARN] Python not found in PATH.
    echo RAG, session_export and the anythingllm tool with advanced features
    echo require Python with chromadb. You can skip this now and configure it later.
    pause
) else (
    echo [OK] Python found.
    echo.
    echo [INFO] Checking chromadb in global Python...
    python -c "import chromadb" > nul 2>&1
    if errorlevel 1 (
        echo [WARN] chromadb not found in global Python.
        echo.
        choice /C YN /M "Create a dedicated venv with chromadb"
        if errorlevel 2 (
            echo [INFO] Venv not created. RAG will not work until you install chromadb.
            echo You can do this later with: pip install chromadb
        ) else (
            echo [INFO] Creating .venv...
            python -m venv .venv
            if errorlevel 1 (
                echo [ERROR] Venv creation failed.
                pause
                exit /b 1
            )
            echo [OK] Venv created. Installing chromadb...
            .venv\Scripts\pip install chromadb
            if errorlevel 1 (
                echo [ERROR] chromadb installation failed.
                pause
                exit /b 1
            )
            echo [OK] chromadb installed in venv.
        )
    ) else (
        echo [OK] chromadb available in global Python.
    )
)

REM Install npm dependencies
echo.
echo [INFO] Installing npm dependencies...
npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.

REM Build TypeScript
echo.
echo [INFO] Compiling TypeScript...
npm run build
if errorlevel 1 (
    echo [ERROR] Build failed.
    echo Make sure TypeScript is installed: npm install -g typescript
    pause
    exit /b 1
)
echo [OK] Build completed.

REM Create logs directory if it doesn't exist
if not exist logs mkdir logs

echo.
echo =========================================
echo  Installation completed!
echo =========================================
echo.
echo Workspace: %AGENT_WORKSPACE%
echo.
echo To start the server normally:
echo   start.bat
echo.
echo To start in debug mode (with file logging):
echo   debug-server.bat
echo.
echo Remember: set AGENT_WORKSPACE=absolute-path-to-workspace
echo in AnythingLLM environment variables if not using start.bat
echo.
pause