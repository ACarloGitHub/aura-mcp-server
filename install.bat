@echo off
setlocal EnableDelayedExpansion
REM install.bat — Setup automatico server MCP su Windows
REM Uso: fai doppio click o esegui da cmd nella cartella mcp-server/

echo =========================================
echo  Aura MCP Server — Installazione
echo =========================================
echo.

REM Verifica Node.js
node --version > nul 2>&1
if errorlevel 1 (
    echo [ERRORE] Node.js non trovato.
    echo Scaricalo da https://nodejs.org/ consigliato LTS
echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('node --version') do set NODE_VER=%%a
echo [OK] Node.js trovato: %NODE_VER%

REM Verifica npm
npm --version > nul 2>&1
if errorlevel 1 (
    echo [ERRORE] npm non trovato.
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('npm --version') do set NPM_VER=%%a
echo [OK] npm trovato: %NPM_VER%

echo.
echo [INFO] Verifica Python...
echo.
python --version > nul 2>&1
if errorlevel 1 (
    echo [WARN] Python non trovato nel PATH.
    echo RAG, session_export e il tool anythingllm con funzionalita avanzate
    echo richiedono Python con chromadb. Puoi saltarlo ora e configurarlo dopo.
    pause
) else (
    echo [OK] Python trovato.
    echo.
    echo [INFO] Verifica chromadb in Python globale...
    python -c "import chromadb" > nul 2>&1
    if errorlevel 1 (
        echo [WARN] chromadb non trovato in Python globale.
        echo.
        choice /C YN /M "Vuoi creare un venv dedicato con chromadb"
        if errorlevel 2 (
            echo [INFO] Venv non creato. RAG non funzionera finche non installi chromadb.
            echo Puoi farlo dopo con: pip install chromadb
        ) else (
            echo [INFO] Creazione venv .venv...
            python -m venv .venv
            if errorlevel 1 (
                echo [ERRORE] Creazione venv fallita.
                pause
                exit /b 1
            )
            echo [OK] Venv creato. Installazione chromadb...
            .venv\Scripts\pip install chromadb
            if errorlevel 1 (
                echo [ERRORE] Installazione chromadb fallita.
                pause
                exit /b 1
            )
            echo [OK] chromadb installato nel venv.
        )
    ) else (
        echo [OK] chromadb disponibile in Python globale.
    )
)

REM Installa dipendenze npm
echo.
echo [INFO] Installazione dipendenze npm...
npm install
if errorlevel 1 (
    echo [ERRORE] npm install fallito.
    pause
    exit /b 1
)
echo [OK] Dipendenze installate.

REM Build TypeScript
echo.
echo [INFO] Compilazione TypeScript...
npm run build
if errorlevel 1 (
    echo [ERRORE] Build fallita.
    echo Assicurati di avere TypeScript installato: npm install -g typescript
    pause
    exit /b 1
)
echo [OK] Build completata.

REM Crea cartella log se non esiste
if not exist logs mkdir logs

echo.
echo =========================================
echo  Installazione completata!
echo =========================================
echo.
echo Workspace: %AGENT_WORKSPACE%
echo.
echo Per avviare il server in normale:
echo   start.bat
echo.
echo Per avviare in modalita debug (con log su file):
echo   debug-server.bat
echo.
echo Ricorda: imposta AGENT_WORKSPACE=percorso-assoluto-del-workspace
echo nelle variabili di ambiente di AnythingLLM se non usi start.bat
echo.
pause
