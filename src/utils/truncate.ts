export const LIMITS = {
  webSnippet: 300,
  ragChunk: 500,
  wikiSnippet: 300,
  wikiBody: 4_000,
  fileBody: 10_000,
  fetchBody: 5_000,
  execOutput: 200_000,
} as const;

export function truncate(s: string, max: number, suffix = "..."): string {
  if (s.length <= max) return s;
  const cut = Math.max(0, max - suffix.length);
  return s.substring(0, cut) + suffix;
}

export function truncateWithCount(s: string, max: number): string {
  if (s.length <= max) return s;
  return truncate(s, max) + `\n\n[... truncated: ${s.length} chars total]`;
}
