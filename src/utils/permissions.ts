import { resolve, isAbsolute } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { getWorkspaceRoot } from "./helpers.js";

export type PermissionScope = "session" | "always";

export interface PermissionEntry {
  path: string;
  scope: PermissionScope;
  tool: string;
  grantedAt: number;
}

export interface AllowedPathOk { ok: true; resolved: string; }
export interface AllowedPathErr { ok: false; error: string; pendingApproval: boolean; path: string; }
export type AllowedPathResult = AllowedPathOk | AllowedPathErr;

// In-memory session permissions
const sessionPaths: PermissionEntry[] = [];

function normaliseSep(p: string): string {
  return p.replace(/\\/g, "/");
}

function isInside(child: string, parent: string): boolean {
  const c = normaliseSep(child).toLowerCase();
  const p = normaliseSep(parent).toLowerCase();
  if (c === p) return true;
  return c.startsWith(p.endsWith("/") ? p : p + "/");
}

function getPermissionsFile(): string {
  return resolve(getWorkspaceRoot(), "allowed-paths.json");
}

function loadAlwaysPermissions(): PermissionEntry[] {
  const file = getPermissionsFile();
  if (!existsSync(file)) return [];
  try {
    const raw = readFileSync(file, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (data.always ?? []);
  } catch {
    return [];
  }
}

function saveAlwaysPermissions(entries: PermissionEntry[]): void {
  const file = getPermissionsFile();
  try {
    const dir = resolve(getWorkspaceRoot());
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ always: entries }, null, 2), "utf-8");
  } catch {
    // best-effort
  }
}

function parseEnvAllowedList(): string[] {
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
 * Resolve an input path against the workspace and the permission store.
 * A relative input is anchored to the workspace root. Absolute inputs must
 * be inside the workspace root, the env var list, or the permission store
 * (session or always). Otherwise returns pendingApproval=true.
 */
export function resolveAllowedPath(input: string | undefined | null, tool = "file"): AllowedPathResult {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, error: "Path is required.", pendingApproval: false, path: "" };
  }
  let resolved: string;
  try {
    resolved = isAbsolute(input) ? resolve(input) : resolve(getWorkspaceRoot(), input);
  } catch (err) {
    return { ok: false, error: `Invalid path: ${err instanceof Error ? err.message : String(err)}`, pendingApproval: false, path: "" };
  }

  const wsRoot = getWorkspaceRoot();
  if (isInside(resolved, wsRoot)) {
    return { ok: true, resolved };
  }

  // Check env var override (permanent)
  const envAllowed = parseEnvAllowedList();
  for (const entry of envAllowed) {
    if (isInside(resolved, entry) || resolved === entry) {
      return { ok: true, resolved };
    }
  }

  // Check always permissions (persistent file)
  const always = loadAlwaysPermissions();
  for (const entry of always) {
    if (isInside(resolved, entry.path) || resolved === entry.path) {
      return { ok: true, resolved };
    }
  }

  // Check session permissions (in-memory)
  for (const entry of sessionPaths) {
    if (isInside(resolved, entry.path) || resolved === entry.path) {
      return { ok: true, resolved };
    }
  }

  // Not allowed — return pending approval
  return {
    ok: false,
    error: `Path outside AGENT_WORKSPACE and not in permission store: ${input}`,
    pendingApproval: true,
    path: resolved,
  };
}

/**
 * Apply the resolver to a list of path-like arguments.
 */
export function resolveAllowedPaths(args: Record<string, unknown>, pathKeys: string[], tool = "file"): AllowedPathResult {
  for (const key of pathKeys) {
    if (!(key in args)) continue;
    const value = args[key];
    if (typeof value !== "string" || value.length === 0) continue;
    const r = resolveAllowedPath(value, tool);
    if (!r.ok) return r;
  }
  return { ok: true, resolved: "" };
}

/**
 * Grant a permission. Session scope is in-memory; always scope is persisted.
 */
export function grantPermission(path: string, scope: PermissionScope, tool: string): void {
  const resolved = resolve(path);
  const entry: PermissionEntry = {
    path: resolved,
    scope,
    tool,
    grantedAt: Math.floor(Date.now() / 1000),
  };

  if (scope === "session") {
    // Avoid duplicates
    if (!sessionPaths.some((e) => e.path === resolved)) {
      sessionPaths.push(entry);
    }
  } else {
    const always = loadAlwaysPermissions();
    if (!always.some((e) => e.path === resolved)) {
      always.push(entry);
      saveAlwaysPermissions(always);
    }
  }
}

/**
 * Revoke a permission from both session and always stores.
 */
export function revokePermission(path: string): void {
  const resolved = resolve(path);
  const idx = sessionPaths.findIndex((e) => e.path === resolved);
  if (idx >= 0) sessionPaths.splice(idx, 1);

  const always = loadAlwaysPermissions();
  const filtered = always.filter((e) => e.path !== resolved);
  if (filtered.length !== always.length) {
    saveAlwaysPermissions(filtered);
  }
}

/**
 * List all permissions (session + always).
 */
export function listPermissions(): PermissionEntry[] {
  const always = loadAlwaysPermissions();
  return [...always, ...sessionPaths];
}

/**
 * Clear all session permissions.
 */
export function clearSessionPermissions(): void {
  sessionPaths.length = 0;
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