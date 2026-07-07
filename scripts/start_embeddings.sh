#!/usr/bin/env bash
# start_embeddings.sh — Launch the llama.cpp embedding server in background.
# Reads AGENT_WORKSPACE (or defaults to the project root) and uses
# vendor/llama.cpp/llama-server + embeddings/nomic-embed-text-v1.5.Q4_K_M.gguf.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENDOR_DIR="${PROJECT_ROOT}/vendor/llama.cpp"
EMB_DIR="${PROJECT_ROOT}/embeddings"
LOG_DIR="${PROJECT_ROOT}/logs"
PID_FILE="${EMB_DIR}/embedding-server.pid"
LOG_FILE="${LOG_DIR}/embedding-server.log"
GGUF_NAME="nomic-embed-text-v1.5.Q4_K_M.gguf"
GGUF_PATH="${EMB_DIR}/${GGUF_NAME}"
HOST="${EMBED_HOST:-127.0.0.1}"
PORT="${EMBED_PORT:-8081}"

mkdir -p "${LOG_DIR}"

if [[ ! -f "${GGUF_PATH}" ]]; then
  echo "[start_embeddings] GGUF not found at ${GGUF_PATH}; run scripts/install_embeddings.sh first." >&2
  exit 1
fi

if [[ -x "${VENDOR_DIR}/llama-server" ]]; then
  BIN="${VENDOR_DIR}/llama-server"
elif [[ -x "${VENDOR_DIR}/llama-embedding" ]]; then
  BIN="${VENDOR_DIR}/llama-embedding"
else
  echo "[start_embeddings] No llama.cpp binary in ${VENDOR_DIR}; run scripts/install_embeddings.sh first." >&2
  exit 1
fi

if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
  echo "[start_embeddings] Embedding server already running (pid $(cat "${PID_FILE}"))"
  exit 0
fi

echo "[start_embeddings] Launching ${BIN} on ${HOST}:${PORT}"
nohup "${BIN}" \
  --model "${GGUF_PATH}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --embedding \
  > "${LOG_FILE}" 2>&1 &

echo $! > "${PID_FILE}"
echo "[start_embeddings] pid written to ${PID_FILE} (log: ${LOG_FILE})"
