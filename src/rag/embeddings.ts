import { NOMIC_MODEL_NAME, embeddingsEndpoint, EMBED_DIM } from "./config.js";

function prefixed(text: string, isQuery: boolean): string {
  const prefix = isQuery ? "search_query: " : "search_document: ";
  return `${prefix}${text.slice(0, 4000)}`;
}

export async function generateEmbedding(
  text: string,
  isQuery: boolean
): Promise<number[]> {
  const url = embeddingsEndpoint();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: NOMIC_MODEL_NAME, input: prefixed(text, isQuery) }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(
      `Embedding request failed (HTTP ${resp.status}) at ${url}: ${detail.slice(0, 200)}`
    );
  }

  const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
  const vec = data.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error(`Embedding response missing data[0].embedding: ${JSON.stringify(data).slice(0, 200)}`);
  }
  if (vec.length !== EMBED_DIM) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBED_DIM}, got ${vec.length}. ` +
        `Wrong model loaded on the embedding server?`
    );
  }
  return vec;
}

export async function generateEmbeddings(
  texts: string[],
  isQuery: boolean
): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  let idx = 0;
  const concurrency = Math.min(4, texts.length);
  const workers = new Array(concurrency).fill(0).map(async () => {
    while (idx < texts.length) {
      const i = idx++;
      out[i] = await generateEmbedding(texts[i], isQuery);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  return generateEmbedding(text, true);
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return generateEmbeddings(texts, false);
}
