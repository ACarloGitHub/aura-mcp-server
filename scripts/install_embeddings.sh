#!/usr/bin/env bash
# install_embeddings.sh — Download llama.cpp CPU-only runtime + the
# `nomic-embed-text-v1.5` GGUF embedding model into the project tree.
# Idempotent: skips a step if the target is already present and matches the
# expected version. Run from anywhere; uses the project root as base.
#
# Outputs:
#   vendor/llama.cpp/llama-embedding (or llama-server, depending on llama.cpp release)
#   embeddings/nomic-embed-text-v1.5.Q4_K_M.gguf
#
# Tested on Linux x86_64 and macOS arm64. Windows uses install_embeddings.bat.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="${PROJECT_ROOT}/vendor/llama.cpp"
EMB_DIR="${PROJECT_ROOT}/embeddings"
GGUF_NAME="nomic-embed-text-v1.5.Q4_K_M.gguf"
GGUF_PATH="${EMB_DIR}/${GGUF_NAME}"
GGUF_URL="https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/${GGUF_NAME}"

LLAMACPP_VERSION="b5325"

mkdir -p "${VENDOR_DIR}" "${EMB_DIR}"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "${OS}:${ARCH}" in
  Linux:x86_64)
    LLAMACPP_ASSET="llama-bin-linux-x64-cpu-${LLAMACPP_VERSION}.zip"
    ;;
  Linux:aarch64)
    LLAMACPP_ASSET="llama-bin-linux-arm64-cpu-${LLAMACPP_VERSION}.zip"
    ;;
  Darwin:arm64)
    LLAMACPP_ASSET="llama-bin-macos-arm64-${LLAMACPP_VERSION}.zip"
    ;;
  Darwin:x86_64)
    LLAMACPP_ASSET="llama-bin-macos-x64-${LLAMACPP_VERSION}.zip"
    ;;
  *)
    echo "[install_embeddings] Unsupported platform: ${OS} ${ARCH}" >&2
    exit 1
    ;;
esac

LLAMACPP_URL="https://github.com/ggml-org/llama.cpp/releases/download/${LLAMACPP_VERSION}/${LLAMACPP_ASSET}"

# llama.cpp binaries for embedding typically come as `llama-server`,
# `llama-embedding`, etc. inside the zip. We pick whichever the release
# ships with; both expose the Ollama-compatible /embedding endpoint.
EMB_BIN="${VENDOR_DIR}/llama-server"
ALT_BIN="${VENDOR_DIR}/llama-embedding"

install_llamacpp() {
  if [[ -x "${EMB_BIN}" || -x "${ALT_BIN}" ]]; then
    echo "[install_embeddings] llama.cpp already present, skipping download."
    return
  fi
  echo "[install_embeddings] Downloading ${LLAMACPP_ASSET}"
  TMP="$(mktemp -d)"
  trap "rm -rf ${TMP}" EXIT
  curl -fsSL -o "${TMP}/llama.zip" "${LLAMACPP_URL}"
  echo "[install_embeddings] Extracting"
  (cd "${TMP}" && unzip -q llama.zip)
  # Layout inside the zip varies by release; find the build dir.
  BUILD_DIR="$(find "${TMP}" -type d -name 'build' | head -n 1 || true)"
  if [[ -z "${BUILD_DIR}" ]]; then
    BUILD_DIR="$(find "${TMP}" -type d -name 'bin' | head -n 1 || true)"
  fi
  if [[ -z "${BUILD_DIR}" || ! -d "${BUILD_DIR}" ]]; then
    echo "[install_embeddings] Could not locate build dir in the archive." >&2
    exit 1
  fi
  cp -R "${BUILD_DIR}/." "${VENDOR_DIR}/"
  chmod +x "${VENDOR_DIR}/llama-server" "${VENDOR_DIR}/llama-embedding" 2>/dev/null || true
  echo "[install_embeddings] llama.cpp installed at ${VENDOR_DIR}"
}

install_model() {
  if [[ -f "${GGUF_PATH}" ]]; then
    echo "[install_embeddings] GGUF already present, skipping download."
    return
  fi
  echo "[install_embeddings] Downloading ${GGUF_NAME}"
  curl -fsSL -o "${GGUF_PATH}" "${GGUF_URL}"
  echo "[install_embeddings] Model saved at ${GGUF_PATH}"
}

install_llamacpp
install_model

echo "[install_embeddings] Done."
echo "  llama.cpp:  ${VENDOR_DIR}"
echo "  gguf:       ${GGUF_PATH}"
echo
echo "Run scripts/start_embeddings.sh to launch the embedding server."
