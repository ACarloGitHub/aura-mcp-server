import { spawn, type ChildProcess } from "child_process";
import { openSync, closeSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { EMBED_HOST, EMBED_PORT, healthEndpoint, llamaServerBinary, nomicGgufPath, ragDataDir } from "./config.js";

let child: ChildProcess | null = null;
let ensuring: Promise<void> | null = null;

const READY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_500;

export function isEmbeddingServerReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  return fetch(healthEndpoint(), { signal: controller.signal })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => clearTimeout(timer));
}

export async function ensureEmbeddingServer(): Promise<void> {
  if (await isEmbeddingServerReachable()) return;
  if (ensuring) return ensuring;
  ensuring = startServer();
  try {
    await ensuring;
  } finally {
    ensuring = null;
  }
}

async function startServer(): Promise<void> {
  const binary = llamaServerBinary();
  const model = nomicGgufPath();

  if (!binary) {
    throw new Error(
      "Embedding backend not found: no llama-server binary. " +
        "Set LLAMACPP_BIN to a llama-server executable, or run scripts/install_embeddings. " +
        "RAG is unavailable until then."
    );
  }
  if (!model) {
    throw new Error(
      "Embedding model not found: nomic-embed-text-v2-moe.Q8_0.gguf missing. " +
        "Set EMBED_GGUF to the GGUF path, or run scripts/install_embeddings to download it. " +
        "RAG is unavailable until then."
    );
  }

  const logDir = join(dirname(ragDataDir()), "logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "embedding-server.log");
  const logFd = openSync(logPath, "a");

  const args = [
    "--model", model,
    "--host", EMBED_HOST,
    "--port", String(EMBED_PORT),
    "--embedding",
    "--n-gpu-layers", "0",
    "--ctx-size", "8192",
    "--parallel", "1",
    "--batch-size", "2048",
  ];

  const spawned = spawn(binary, args, {
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
    detached: false,
    env: { ...process.env },
  });
  closeSync(logFd);

  child = spawned;

  spawned.on("exit", (code, signal) => {
    if (child === spawned) child = null;
    if (process.env.MCP_DEBUG) {
      console.error(`[rag] embedding server exited (code=${code} signal=${signal})`);
    }
  });

  const ready = await waitForReady();
  if (!ready) {
    stopEmbeddingServer();
    throw new Error(
      `Embedding server did not become ready within ${READY_TIMEOUT_MS / 1000}s. ` +
        `Check the log: ${logPath}`
    );
  }
}

async function waitForReady(): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child === null) return false;
    if (await isEmbeddingServerReachable()) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

export function stopEmbeddingServer(): void {
  if (!child) return;
  try {
    if (existsSync(join(ragDataDir(), "embedding-server.pid"))) {
      // best-effort pid file not used; kill by child handle
    }
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { windowsHide: true });
    } else {
      process.kill(child.pid as number, "SIGTERM");
    }
  } catch {
    // ignore
  }
  child = null;
}

export function registerShutdownHook(): void {
  const stop = () => stopEmbeddingServer();
  process.once("exit", stop);
  process.once("SIGINT", () => { stop(); process.exit(0); });
  process.once("SIGTERM", () => { stop(); process.exit(0); });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
