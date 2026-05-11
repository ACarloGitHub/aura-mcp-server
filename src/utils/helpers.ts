import { homedir } from "os";
import { fileURLToPath } from "url";
import { join, resolve, dirname, normalize as pathNormalize } from "path";
import { existsSync } from "fs";

/**
 * Rileva se siamo su WSL (Windows Subsystem for Linux).
 */
function isWSL(): boolean {
  return !!process.env.WSL_DISTRO_NAME || !!process.env.WSL_INTEROP ||
    (process.platform === "linux" && (process.release as any).version.toLowerCase().includes("microsoft"));
}

/**
 * Converte un path Windows in path Unix SOLO se su WSL.
 * Su Windows nativo lascia il path Windows cosi com'e'.
 */
export function normalizeWindowsPath(p: string): string {
  // Se non e' un path Windows, normalizza solo i backslash
  if (!/^[A-Za-z]:[\\\/]/.test(p)) {
    return p.replace(/\\/g, "/");
  }

  // Su WSL: C:\Users\... -> /mnt/c/Users/...
  if (isWSL()) {
    const drive = p[0].toLowerCase();
    let rest = p.slice(2).replace(/\\/g, "/");
    if (!rest.startsWith("/")) rest = "/" + rest;
    return `/mnt/${drive}${rest}`;
  }

  // Su Windows nativo: lascia cosi com'e', solo normalizza separatori interni
  return p;
}

/**
 * Determina il workspace root in modo robusto.
 * Priorita': env AGENT_WORKSPACE > directory del server > home dell'utente.
 * Su Windows nativo: risolve con path Windows.
 * Su WSL: risolve con path Unix (/mnt/...).
 */
export function getWorkspaceRoot(): string {
  if (process.env.AGENT_WORKSPACE) {
    return resolve(normalizeWindowsPath(process.env.AGENT_WORKSPACE));
  }
  // Se siamo in dist/, risali di 2 livelli per arrivare alla root del progetto
  // @ts-ignore — import.meta.url valido in ESM Node16 ma TS lo rifiuta
  const distDir = dirname(fileURLToPath(import.meta.url));
  const serverDir = dirname(distDir);
  return resolve(serverDir, "..");
}

/**
 * Risolve un percorso relativo al workspace o assoluto.
 * Accetta path Windows (C:\...) o Unix (/mnt/... o /home/...).
 * Su Windows nativo restituisce path Windows. Su WSL restituisce path Unix.
 */
export function resolveWorkspacePath(relOrAbs: string): string {
  const normalized = normalizeWindowsPath(relOrAbs);
  if (isAbsolutePath(normalized)) {
    return resolve(normalized);
  }
  return resolve(getWorkspaceRoot(), normalized);
}

/**
 * Verifica se un percorso e' assoluto (Unix o Windows).
 */
export function isAbsolutePath(p: string): boolean {
  const n = pathNormalize(p);
  return n.startsWith("/") || /^[A-Za-z]:[\\\/]/.test(p);
}

/**
 * Trunca testo con suffisso.
 */
export function truncateText(text: string, maxLength: number, suffix = "..."): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Formatta un errore per il ritorno MCP.
 */
export function formatError(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `Errore: ${msg}` }],
    isError: true,
  };
}

/**
 * Crea una risposta MCP di testo.
 */
export function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}

/**
 * Rileva se un buffer e' probabilmente binario.
 */
export function isBinaryBuffer(buf: Buffer, sampleSize = 512): boolean {
  if (buf.length === 0) return false;
  const sample = buf.subarray(0, Math.min(buf.length, sampleSize));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

/**
 * Trova python3 o python nel PATH di sistema.
 * Lancia 'where' su Windows o 'which' su Unix.
 */
function findPythonInPath(): string | null {
  try {
    const { execSync } = require("child_process");
    const cmd = process.platform === "win32" ? "where python" : "which python3 || which python";
    const result = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    const lines = result.trim().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const candidate = line.trim();
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Verifica se un eseguibile python esiste e puo' importare chromadb.
 */
function isPythonUsable(pythonPath: string): boolean {
  if (!existsSync(pythonPath)) return false;
  try {
    const { execSync } = require("child_process");
    execSync(`"${pythonPath}" -c "import chromadb"`, { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Legge il Python path per RAG da env o cerca nei posti comuni.
 * Supporta WSL, Windows, Linux, macOS.
 * Priorita':
 *   1. env RAG_PYTHON_PATH
 *   2. .venv/Scripts/python.exe (Windows) o .venv/bin/python (Unix) se esiste
 *   3. python/python3 trovato nel PATH se ha chromadb
 *   4. Fails con errore leggibile se nessuno funziona.
 */
export function getPythonPath(): string {
  if (process.env.RAG_PYTHON_PATH) {
    if (isPythonUsable(process.env.RAG_PYTHON_PATH)) {
      return process.env.RAG_PYTHON_PATH;
    }
    console.error(`[WARN] RAG_PYTHON_PATH settato ma non valido: ${process.env.RAG_PYTHON_PATH}`);
  }

  // @ts-ignore
  const distDir = dirname(fileURLToPath(import.meta.url));
  const serverDir = dirname(distDir);
  const workspaceRoot = resolve(serverDir, "..");

  const candidates = [
    join(workspaceRoot, ".venv", "Scripts", "python.exe"),   // Windows venv
    join(workspaceRoot, ".venv", "bin", "python3"),           // Unix venv
    join(workspaceRoot, ".venv", "bin", "python"),              // Unix venv alt
    join(serverDir, ".venv", "Scripts", "python.exe"),        // Windows (server dir)
    join(serverDir, ".venv", "bin", "python3"),               // Unix (server dir)
    join(serverDir, ".venv", "bin", "python"),                  // Unix (server dir alt)
  ];

  for (const candidate of candidates) {
    if (isPythonUsable(candidate)) {
      return candidate;
    }
  }

  // Cerca nel PATH
  const pathPython = findPythonInPath();
  if (pathPython && isPythonUsable(pathPython)) {
    return pathPython;
  }

  // Ultimo fallback: prova comandi generici (potrebbero fallire in runtime)
  const generic = process.platform === "win32" ? "python" : "python3";
  return generic;
}
