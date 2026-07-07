import { resolveAllowedPath, resolveAllowedPaths, enabledCategories } from "./sandbox.js";

const assertEq = (actual: unknown, expected: unknown, label: string): void => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
    process.exit(1);
  }
  console.log(`ok   ${label}`);
};

const ws = process.env.AGENT_WORKSPACE || process.cwd();
console.log("workspace:", ws);

// Case 1: relative path inside workspace
const r1 = resolveAllowedPath("inside.txt");
assertEq(r1.ok, true, "relative path resolves to workspace");
if (r1.ok) assertEq(r1.resolved.endsWith("inside.txt"), true, "relative path appended");

// Case 2: ../../../etc/passwd - resolves outside WS, no allowed list -> rejected
process.env.AURA_ALLOWED_PATHS = "";
const r2 = resolveAllowedPath("../../../etc/passwd");
assertEq(r2.ok, false, "traversal outside WS rejected when no allowed list");
if (!r2.ok) console.log("  r2.error:", r2.error);

// Case 3: absolute Windows path outside WS, no allowed list -> rejected
const r3 = resolveAllowedPath("C:\\Windows\\System32\\drivers\\etc\\hosts");
assertEq(r3.ok, false, "absolute path on Win outside WS - rejected");
if (!r3.ok) console.log("  r3.error:", r3.error);

// Case 4: with AURA_ALLOWED_PATHS including a parent dir, absolute path accepted
const outsideDir = process.platform === "win32" ? `${ws}\\..\\aura-mcp-test` : `${ws}/../aura-mcp-test`;
process.env.AURA_ALLOWED_PATHS = process.platform === "win32" ? `${ws};${outsideDir}` : `${ws}:${outsideDir}`;
const r4 = resolveAllowedPath(process.platform === "win32" ? `${ws}\\inside.md` : `${ws}/inside.md`);
assertEq(r4.ok, true, "inside workspace - always allowed");
const r4b = resolveAllowedPath(process.platform === "win32" ? `${outsideDir}\\foo.md` : `${outsideDir}/foo.md`);
assertEq(r4b.ok, true, "allowed-path entry accepted");
console.log("  r4b.resolved =", r4b.ok ? r4b.resolved : "(error)");

// Case 5: resolveAllowedPaths skips empty strings, reports first failure
const r5 = resolveAllowedPaths({ p: "x", q: "../../etc/passwd" }, ["p", "q"]);
assertEq(r5.ok, false, "first failing path reported");

// Case 6: enabledCategories parses
const all = ["file", "exec", "exec_job", "web_search", "wiki", "wiki_ingest", "rag", "planner", "compact", "anythingllm", "notify"];
process.env.AURA_ENABLED_CATEGORIES = "file,planner";
const e1 = enabledCategories(all);
assertEq(e1 ? [...e1].sort().join(",") : null, "file,planner", "category filter file,planner");

process.env.AURA_ENABLED_CATEGORIES = "";
const e2 = enabledCategories(all);
assertEq(e2, null, "empty env returns null (all allowed)");

process.env.AURA_ENABLED_CATEGORIES = "nonexistent";
const e3 = enabledCategories(all);
assertEq(e3 ? e3.size : 0, 0, "unknown category returns empty set");

delete process.env.AURA_ENABLED_CATEGORIES;
delete process.env.AURA_ALLOWED_PATHS;
console.log("sandbox.test.ts: all assertions passed");
