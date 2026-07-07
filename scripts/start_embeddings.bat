@echo off
REM start_embeddings.bat — Launch the llama.cpp embedding server in background.

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "VENDOR_DIR=%PROJECT_ROOT%\vendor\llama.cpp"
set "EMB_DIR=%PROJECT_ROOT%\embeddings"
set "LOG_DIR=%PROJECT_ROOT%\logs"
set "PID_FILE=%EMB_DIR%\embedding-server.pid"
set "LOG_FILE=%LOG_DIR%\embedding-server.log"
set "GGUF_NAME=nomic-embed-text-v1.5.Q4_K_M.gguf"
set "GGUF_PATH=%EMB_DIR%\%GGUF_NAME%"
set "HOST=%EMBED_HOST%"
if "%HOST%"=="" set "HOST=127.0.0.1"
set "PORT=%EMBED_PORT%"
if "%PORT%"=="" set "PORT=8081"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

if not exist "%GGUF_PATH%" (
    echo [start_embeddings] GGUF not found at %GGUF_PATH%. Run scripts\install_embeddings.bat first.
    exit /b 1
)

set "BIN="
if exist "%VENDOR_DIR%\llama-server.exe" set "BIN=%VENDOR_DIR%\llama-server.exe"
if "%BIN%"=="" if exist "%VENDOR_DIR%\llama-embedding.exe" set "BIN=%VENDOR_DIR%\llama-embedding.exe"
if "%BIN%"=="" (
    echo [start_embeddings] No llama.cpp binary in %VENDOR_DIR%. Run scripts\install_embeddings.bat first.
    exit /b 1
)

REM If a prior PID is still alive, skip.
if exist "%PID_FILE%" (
    for /f %%P in ('type "%PID_FILE%" 2^>nul') do (
        tasklist /FI "PID eq %%P" 2>nul | findstr /R "%%P" >nul
        if not errorlevel 1 (
            echo [start_embeddings] Embedding server already running (pid %%P).
            exit /b 0
        )
    )
)

echo [start_embeddings] Launching %BIN% on %HOST%:%PORT%
start /B "" "%BIN%" --model "%GGUF_PATH%" --host %HOST% --port %PORT% --embedding > "%LOG_FILE%" 2>&1

rem Capture the launched pid if reachable; PID is best-effort.
for /f "tokens=2" %%P in ('tasklist /FI "IMAGENAME eq llama-server.exe" /NH /FO TABLE 2^>nul ^| findstr llama-server.exe') do (
    echo %%P > "%PID_FILE%"
    goto :PID_DONE
)
echo [start_embeddings] WARNING: could not capture pid (server may still be starting).

:PID_DONE
echo [start_embeddings] log: %LOG_FILE%
