import { homedir } from "os";
import { join, resolve } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const EMBED_DIM = 768;

export const NOMIC_MODEL_NAME = "nomic-embed-text-v2-moe";
export const NOMIC_GGUF_NAME = "nomic-embed-text-v2-moe.Q8_0.gguf";

export const EMBED_HOST = process.env.EMBED_HOST || "127.0.0.1";
export const EMBED_PORT = Number(process.env.EMBED_PORT) || 11434;

export function embedBaseUrl(): string {
  const fromEnv = process.env.EMBED_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return `http://${EMBED_HOST}:${EMBED_PORT}`;
}

export function embeddingsEndpoint(): string {
  return `${embedBaseUrl()}/v1/embeddings`;
}

export function healthEndpoint(): string {
  return `${embedBaseUrl()}/health`;
}

export function tagsEndpoint(): string {
  return `${embedBaseUrl()}/api/tags`;
}

export function resolveServerDir(): string {
  if (process.env.AGENT_WORKSPACE) return process.env.AGENT_WORKSPACE;
  return resolve(__dirname, "..", "..");
}

export function ragDataDir(): string {
  if (process.env.RAG_DATA_DIR) return process.env.RAG_DATA_DIR;
  return join(resolveServerDir(), "rag", "rag_data");
}

export function ragDbPath(): string {
  return join(ragDataDir(), "rag.sqlite");
}

export function platformLlamaCppDir(): { dir: string; platform: string } | null {
  const serverDir = resolveServerDir();
  const vendorDir = join(serverDir, "vendor", "llama.cpp");
  const map: Record<string, string> = {
    win32: "windows",
    darwin: "macos",
    linux: "linux",
  };
  const platform = map[process.platform];
  if (!platform) return null;
  const dir = join(vendorDir, platform);
  if (existsSync(dir)) return { dir, platform };
  if (existsSync(vendorDir)) return { dir: vendorDir, platform };
  return null;
}

export function llamaServerBinary(): string | null {
  if (process.env.LLAMACPP_BIN && existsSync(process.env.LLAMACPP_BIN)) {
    return process.env.LLAMACPP_BIN;
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  const candidates: string[] = [];
  const plat = platformLlamaCppDir();
  if (plat) {
    candidates.push(join(plat.dir, `llama-server${ext}`));
  }
  const serverDir = resolveServerDir();
  candidates.push(join(serverDir, "vendor", "llama.cpp", `llama-server${ext}`));

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function nomicGgufPath(): string | null {
  if (process.env.EMBED_GGUF && existsSync(process.env.EMBED_GGUF)) {
    return process.env.EMBED_GGUF;
  }
  const serverDir = resolveServerDir();
  const candidates = [
    join(serverDir, "embeddings", NOMIC_GGUF_NAME),
    join(serverDir, NOMIC_GGUF_NAME),
    join(homedir(), ".local", "share", "auramcp", "embeddings", NOMIC_GGUF_NAME),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}
