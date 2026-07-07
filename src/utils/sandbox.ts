import { resolve, sep, isAbsolute } from "path";
import { getWorkspaceRoot } from "./helpers.js";

export interface AllowedPathOk { ok: true; resolved: string; }
export interface AllowedPathErr { ok: false; error: string; }
export type AllowedPathResult = AllowedPathOk | AllowedPathErr;

function normaliseSep(p: string): string {
  return p.replace(/\\/g, "/");
}

function isInside(child: string, parent: string): boolean {
  const c = normaliseSep(child);
  const p = normaliseSep(parent);
  if (c === p) return true;
  return c.startsWith(p.endsWith("/") ? p : p + "/");
}

function parseAllowedList(): string[] {
  const raw = process.env.AURA_ALLOWED_PATHS || "";
  const sep0 = process.platform === "win32" ? ";" : ":";
  const out: string[] = [];
  for (const segment of raw.split(sep0)) {
    const trimmed = segment.trim();
    if (trimmed) {
      try {
        out.push(resolve(trimmed));
      } catch {
        // ignore invalid path entry
      }
    }
  }
  return out;
}

/**
 * Resolve an input path against the workspace sandbox and the optional
 * AURA_ALLOWED_PATHS opt-in list. A relative input is anchored to the
 * workspace root. Absolute inputs must be inside the workspace root or
 * one of the allowed-paths entries.
 */
export function resolveAllowedPath(input: string | undefined | null): AllowedPathResult {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, error: "Path is required." };
  }
  let resolved: string;
  try {
    resolved = isAbsolute(input) ? resolve(input) : resolve(getWorkspaceRoot(), input);
  } catch (err) {
    return { ok: false, error: `Invalid path: ${err instanceof Error ? err.message : String(err)}` };
  }

  const wsRoot = getWorkspaceRoot();
  if (isInside(resolved, wsRoot)) {
    return { ok: true, resolved };
  }

  const allowed = parseAllowedList();
  for (const entry of allowed) {
    if (isInside(resolved, entry) || resolved === entry) {
      return { ok: true, resolved };
    }
  }

  return {
    ok: false,
    error: `Path outside AGENT_WORKSPACE and not in AURA_ALLOWED_PATHS: ${input}`,
  };
}

/**
 * Apply the resolver to a list of path-like arguments. Returns the first
 * failing argument or `{ ok: true }` if all paths resolve.
 */
export function resolveAllowedPaths(args: Record<string, unknown>, pathKeys: string[]): AllowedPathResult {
  for (const key of pathKeys) {
    if (!(key in args)) continue;
    const value = args[key];
    if (typeof value !== "string" || value.length === 0) continue;
    const r = resolveAllowedPath(value);
    if (!r.ok) return r;
  }
  return { ok: true, resolved: "" };
}

/**
 * Parse AURA_ENABLED_CATEGORIES. Returns the set of allowed tool names;
 * empty/absent env means "all categories allowed" (default behaviour).
 */
export function enabledCategories(allToolNames: string[]): Set<string> | null {
  const raw = process.env.AURA_ENABLED_CATEGORIES;
  if (!raw) return null;
  const wanted = new Set(
    raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
  );
  if (wanted.size === 0) return new Set();
  return new Set(allToolNames.filter((n) => wanted.has(n)));
}
