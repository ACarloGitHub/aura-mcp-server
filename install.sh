#!/usr/bin/env bash
# install.sh — Automatic MCP server setup on Linux / macOS / WSL
# Usage: ./install.sh   (must be run in the mcp-server/ folder)

set -e

echo "========================================="
echo " Aura MCP Server — Installation"
echo "========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found."
    echo "Install it:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  macOS:        brew install node"
    echo "  Otherwise:    https://nodejs.org/ (LTS recommended)"
    exit 1
fi
NODE_VER=$(node --version)
echo "[OK] Node.js found: $NODE_VER"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm not found."
    exit 1
fi
NPM_VER=$(npm --version)
echo "[OK] npm found: $NPM_VER"

# Install dependencies
echo ""
echo "[INFO] Installing dependencies..."
npm install

echo "[OK] Dependencies installed."

# Build TypeScript
echo ""
echo "[INFO] Compiling TypeScript..."
npm run build

echo "[OK] Build completed."

# Create logs directory
mkdir -p logs

echo ""
echo "========================================="
echo " Installation completed!"
echo "========================================="
echo ""
echo "To start the server:"
echo "  ./start.sh          (normal)"
echo "  ./debug-server.sh   (with file logging)"
echo ""
echo "The server connects via stdio — start it from AnythingLLM."