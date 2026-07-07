import { LIMITS, truncate, truncateWithCount } from "./truncate.js";

const assertEq = (actual: unknown, expected: unknown, label: string): void => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
    process.exit(1);
  }
  console.log(`ok   ${label}`);
};

assertEq(truncate("hello", 10), "hello", "no truncation under limit");
assertEq(truncate("hello world", 5), "he...", "truncate appends suffix");
assertEq(truncate("hello world", 5, "~~"), "hel~~", "truncate respects custom suffix");
assertEq(truncate("abc", 0), "...", "truncate handles zero max");
assertEq(truncateWithCount("a".repeat(20), 10), `aaaaaaa...\n\n[... truncated: 20 chars total]`, "truncateWithCount annotates total");
assertEq(truncateWithCount("short", 100), "short", "truncateWithCount no-op under limit");

assertEq(LIMITS.webSnippet, 300, "LIMITS.webSnippet");
assertEq(LIMITS.ragChunk, 500, "LIMITS.ragChunk");
assertEq(LIMITS.wikiSnippet, 300, "LIMITS.wikiSnippet");
assertEq(LIMITS.wikiBody, 4_000, "LIMITS.wikiBody");
assertEq(LIMITS.fileBody, 10_000, "LIMITS.fileBody");
assertEq(LIMITS.fetchBody, 5_000, "LIMITS.fetchBody");
assertEq(LIMITS.execOutput, 200_000, "LIMITS.execOutput");

console.log("truncate.test.ts: all assertions passed");
