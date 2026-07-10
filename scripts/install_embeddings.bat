@echo off
REM install_embeddings.bat — Download the nomic-embed-text-v2-moe GGUF embedding
REM model into the project tree. llama.cpp (CPU) is already vendored in
REM vendor\llama.cpp\<platform>\, so this script only fetches the model.
REM Idempotent. Run from anywhere; uses the project root as base.

setlocal EnableDelayedExpansion

set "PROJECT_ROOT=%~dp0.."
set "EMB_DIR=%PROJECT_ROOT%\embeddings"
set "GGUF_NAME=nomic-embed-text-v2-moe.Q8_0.gguf"
set "GGUF_URL=https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF/resolve/main/%GGUF_NAME%"

if not exist "%EMB_DIR%" mkdir "%EMB_DIR%"

if exist "%EMB_DIR%\%GGUF_NAME%" goto SKIP_MODEL
echo [install_embeddings] Downloading %GGUF_NAME% (~488 MB)
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%GGUF_URL%' -OutFile '%EMB_DIR%\%GGUF_NAME%'"
if errorlevel 1 (
    echo [install_embeddings] Download failed.
    exit /b 1
)
echo [install_embeddings] Model saved at %EMB_DIR%\%GGUF_NAME%

:SKIP_MODEL
echo [install_embeddings] Done.
echo   gguf:       %EMB_DIR%\%GGUF_NAME%
echo   llama.cpp:  %PROJECT_ROOT%\vendor\llama.cpp\
echo.
echo The Node MCP server starts llama-server automatically on first RAG use.
