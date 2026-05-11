#!/usr/bin/env bash
# install.sh — Setup automatico server MCP su Linux / macOS / WSL
# Uso: ./install.sh   (deve essere eseguito nella cartella mcp-server/)

set -e

echo "========================================="
echo " Aura MCP Server — Installazione"
echo "========================================="
echo ""

# Verifica Node.js
if ! command -v node &> /dev/null; then
    echo "[ERRORE] Node.js non trovato."
    echo "Installalo:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  macOS:        brew install node"
    echo "  Altrimenti:   https://nodejs.org/ (LTS consigliato)"
    exit 1
fi
NODE_VER=$(node --version)
echo "[OK] Node.js trovato: $NODE_VER"

# Verifica npm
if ! command -v npm &> /dev/null; then
    echo "[ERRORE] npm non trovato."
    exit 1
fi
NPM_VER=$(npm --version)
echo "[OK] npm trovato: $NPM_VER"

# Installa dipendenze
echo ""
echo "[INFO] Installazione dipendenze..."
npm install

echo "[OK] Dipendenze installate."

# Build TypeScript
echo ""
echo "[INFO] Compilazione TypeScript..."
npm run build

echo "[OK] Build completata."

# Crea cartella log
mkdir -p logs

echo ""
echo "========================================="
echo " Installazione completata!"
echo "========================================="
echo ""
echo "Per avviare il server:"
echo "  ./start.sh          (normale)"
echo "  ./debug-server.sh   (con log su file)"
echo ""
echo "Il server si connette via stdio — avvialo da AnythingLLM."
