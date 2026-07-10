export function chunkText(
  text: string,
  chunkSize = 250,
  overlap = 30
): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  if (words.length <= chunkSize) return [clean];

  const step = Math.max(1, chunkSize - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + chunkSize).join(" ");
    chunks.push(slice);
    if (start + chunkSize >= words.length) break;
  }
  return chunks;
}
