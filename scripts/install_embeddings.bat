@echo off
REM install_embeddings.bat — Download llama.cpp CPU-only runtime + the
REM `nomic-embed-text-v1.5` GGUF embedding model into the project tree.
REM Idempotent. Run from anywhere; uses the project root as base.

setlocal EnableDelayedExpansion

set "PROJECT_ROOT=%~dp0.."
set "VENDOR_DIR=%PROJECT_ROOT%\vendor\llama.cpp"
set "EMB_DIR=%PROJECT_ROOT%\embeddings"
set "GGUF_NAME=nomic-embed-text-v1.5.Q4_K_M.gguf"
set "GGUF_URL=https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/%GGUF_NAME%"

set "LLAMACPP_VERSION=b5325"
set "LLAMACPP_ASSET=llama-bin-win-cpu-x64-%LLAMACPP_VERSION%.zip"
set "LLAMACPP_URL=https://github.com/ggml-org/llama.cpp/releases/download/%LLAMACPP_VERSION%/%LLAMACPP_ASSET%"

if not exist "%VENDOR_DIR%" mkdir "%VENDOR_DIR%"
if not exist "%EMB_DIR%" mkdir "%EMB_DIR%"

set "EMB_BIN=%VENDOR_DIR%\llama-server.exe"
set "ALT_BIN=%VENDOR_DIR%\llama-embedding.exe"

REM --- llama.cpp ---
if exist "%EMB_BIN%" goto SKIP_LLAMACPP
if exist "%ALT_BIN%" goto SKIP_LLAMACPP

echo [install_embeddings] Downloading %LLAMACPP_ASSET%
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%LLAMACPP_URL%' -OutFile '%TEMP%\llama.zip'"

if errorlevel 1 (
    echo [install_embeddings] Download failed.
    exit /b 1
)

echo [install_embeddings] Extracting
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%TEMP%\llama.zip' -DestinationPath '%TEMP%\llama-extract' -Force"
powershell -NoProfile -Command "$build = Get-ChildItem -Path '%TEMP%\llama-extract' -Recurse -Directory -Filter 'build' | Select-Object -First 1; if ($build) { robocopy $build.FullName '%VENDOR_DIR%' /E }"

del /q "%TEMP%\llama.zip"

:SKIP_LLAMACPP
echo [install_embeddings] llama.cpp installed at %VENDOR_DIR%

REM --- GGUF ---
if exist "%EMB_DIR%\%GGUF_NAME%" goto SKIP_MODEL
echo [install_embeddings] Downloading %GGUF_NAME%
powershell -NoProfile -Command "Invoke-WebRequest -Uri '%GGUF_URL%' -OutFile '%EMB_DIR%\%GGUF_NAME%'"
echo [install_embeddings] Model saved at %EMB_DIR%\%GGUF_NAME%

:SKIP_MODEL
echo [install_embeddings] Done.
echo   llama.cpp:  %VENDOR_DIR%
echo   gguf:       %EMB_DIR%\%GGUF_NAME%
echo.
echo Run scripts\start_embeddings.bat to launch the embedding server.
