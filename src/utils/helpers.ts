import { fileURLToPath } from "url";
import { resolve, dirname, normalize as pathNormalize } from "path";

/**
 * Detect if running under WSL (Windows Subsystem for Linux).
 */
function isWSL(): boolean {
  return !!process.env.WSL_DISTRO_NAME || !!process.env.WSL_INTEROP ||
    (process.platform === "linux" && (process.release as any).version.toLowerCase().includes("microsoft"));
}

/**
 * Convert a Windows path to Unix path ONLY when running under WSL.
 * On native Windows, leave the Windows path as-is.
 */
export function normalizeWindowsPath(p: string): string {
  // If not a Windows path, just normalize backslashes
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

  // On native Windows: leave as-is, just normalize internal separators
  return p;
}

/**
 * Determine the workspace root robustly.
 * Priority: env AGENT_WORKSPACE > server directory > user home.
 * On native Windows: resolves with Windows paths.
 * On WSL: resolves with Unix paths (/mnt/...).
 */
export function getWorkspaceRoot(): string {
  if (process.env.AGENT_WORKSPACE) {
    return resolve(normalizeWindowsPath(process.env.AGENT_WORKSPACE));
  }
  // If running from dist/, go up 2 levels to reach project root
  // @ts-ignore — import.meta.url valido in ESM Node16 ma TS lo rifiuta
  const distDir = dirname(fileURLToPath(import.meta.url));
  const serverDir = dirname(distDir);
  return resolve(serverDir, "..");
}

/**
 * Resolve a path relative to the workspace or absolute.
 * Accepts Windows (C:\...) or Unix (/mnt/... or /home/...) paths.
 * Returns Windows paths on native Windows. Returns Unix paths on WSL.
 */
export function resolveWorkspacePath(relOrAbs: string): string {
  const normalized = normalizeWindowsPath(relOrAbs);
  if (isAbsolutePath(normalized)) {
    return resolve(normalized);
  }
  return resolve(getWorkspaceRoot(), normalized);
}

/**
 * Check whether a path is absolute (Unix or Windows).
 */
export function isAbsolutePath(p: string): boolean {
  const n = pathNormalize(p);
  return n.startsWith("/") || /^[A-Za-z]:[\\\/]/.test(p);
}

/**
 * Truncate text with a suffix.
 */
export function truncateText(text: string, maxLength: number, suffix = "..."): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Append a single line to a log file with size-based rotation.
 * When the file exceeds maxSizeMB, it's renamed to `.1` (overwriting any
 * existing `.1`) and a fresh file starts. All operations are best-effort:
 * logging failures must never block the tool call return path.
 */
export async function appendLogWithRotation(
  filepath: string,
  line: string,
  maxSizeMB = 10
): Promise<void> {
  const { appendFile, stat, rename, unlink } = await import("fs/promises");
  try {
    const stats = await stat(filepath);
    if (stats.size >= maxSizeMB * 1024 * 1024) {
      const rotated = filepath + ".1";
      try { await unlink(rotated); } catch { /* no previous rotation file, fine */ }
      try { await rename(filepath, rotated); } catch { /* race condition, ignore */ }
    }
  } catch {
    // file does not exist yet — it will be created by appendFile
  }
  try {
    await appendFile(filepath, line);
  } catch {
    // swallow logging errors
  }
}

/**
 * Format an error for MCP return.
 */
export function formatError(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `Error: ${msg}` }],
    isError: true,
  };
}

/**
 * Create a text MCP response.
 */
export function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}

/**
 * Detect if a buffer is likely binary.
 */
export function isBinaryBuffer(buf: Buffer, sampleSize = 512): boolean {
  if (buf.length === 0) return false;
  const sample = buf.subarray(0, Math.min(buf.length, sampleSize));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}
