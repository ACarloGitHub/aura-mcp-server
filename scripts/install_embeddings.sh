#!/usr/bin/env bash
# install_embeddings.sh — Download the nomic-embed-text-v2-moe GGUF embedding
# model into the project tree. llama.cpp (CPU) is already vendored in
# vendor/llama.cpp/<platform>/, so this script only fetches the model.
# Idempotent. Run from anywhere; uses the project root as base.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EMB_DIR="${PROJECT_ROOT}/embeddings"
GGUF_NAME="nomic-embed-text-v2-moe.Q8_0.gguf"
GGUF_PATH="${EMB_DIR}/${GGUF_NAME}"
GGUF_URL="https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF/resolve/main/${GGUF_NAME}"

mkdir -p "${EMB_DIR}"

if [[ -f "${GGUF_PATH}" ]]; then
  echo "[install_embeddings] GGUF already present, skipping download."
else
  echo "[install_embeddings] Downloading ${GGUF_NAME} (~488 MB)"
  curl -fSL --retry 3 -o "${GGUF_PATH}" "${GGUF_URL}"
  echo "[install_embeddings] Model saved at ${GGUF_PATH}"
fi

echo "[install_embeddings] Done."
echo "  gguf:       ${GGUF_PATH}"
echo "  llama.cpp:  ${PROJECT_ROOT}/vendor/llama.cpp/"
echo
echo "The Node MCP server starts llama-server automatically on first RAG use."
