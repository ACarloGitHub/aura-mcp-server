import { getDb, type SearchResult, type AddResult, type CollectionInfo } from "./db.js";
import { embedQuery, embedDocuments } from "./embeddings.js";
import { chunkText } from "./chunker.js";
import { entitiesToMetadata } from "./entityExtractor.js";
import { ensureEmbeddingServer } from "./llamaserver.js";

function toFloat32(vec: number[]): Float32Array {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

function parseJson(text: string | null | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function ragAdd(params: {
  collection: string;
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}): Promise<AddResult> {
  const { collection, id, text } = params;
  if (!collection || !id || !text) {
    throw new Error("ragAdd requires collection, id and text");
  }
  await ensureEmbeddingServer();

  const db = getDb();
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw new Error("ragAdd: text is empty after normalization");
  }

  let baseMeta: Record<string, unknown> = { ...(params.metadata ?? {}) };
  if (collection === "sessions") {
    baseMeta = { ...baseMeta, ...entitiesToMetadata(text) };
  }

  const delRowids = db
    .prepare("SELECT rowid AS r FROM rag_chunks WHERE collection = ? AND doc_id = ?")
    .all(collection, id) as { r: number }[];
  const deleteDoc = db.transaction((rowids: number[]) => {
    const dv = db.prepare("DELETE FROM rag_vectors WHERE rowid = ?");
    const dc = db.prepare("DELETE FROM rag_chunks WHERE rowid = ?");
    for (const r of rowids) {
      dv.run(r);
      dc.run(r);
    }
  });
  if (delRowids.length) deleteDoc(delRowids.map((x) => x.r));

  const vectors = await embedDocuments(chunks);

  const insertDoc = db.transaction((items: { vec: number[]; chunk: string; idx: number }[]) => {
    const insVec = db.prepare("INSERT INTO rag_vectors(embedding, collection) VALUES (?, ?)");
    const insChunk = db.prepare(
      "INSERT INTO rag_chunks(rowid, collection, doc_id, chunk_index, content, metadata, created_at) VALUES (?,?,?,?,?,?,?)"
    );
    const now = Date.now();
    for (const it of items) {
      const info = insVec.run(toFloat32(it.vec), collection);
      const rowid = Number(info.lastInsertRowid);
      const meta = { ...baseMeta, chunk: it.idx, total_chunks: items.length };
      insChunk.run(rowid, collection, id, it.idx, it.chunk, JSON.stringify(meta), now);
    }
  });
  insertDoc(vectors.map((vec, idx) => ({ vec, chunk: chunks[idx], idx })));

  return { collection, doc_id: id, chunks: chunks.length };
}

export async function ragSearch(params: {
  collection: string;
  query: string;
  limit?: number;
  filter?: Record<string, unknown>;
}): Promise<{ collection: string; query: string; results: SearchResult[] }> {
  const { collection, query } = params;
  if (!collection || !query) throw new Error("ragSearch requires collection and query");
  const limit = Math.max(1, Math.min(params.limit ?? 5, 100));
  await ensureEmbeddingServer();

  const qvec = await embedQuery(query);
  const db = getDb();

  const k = params.filter ? Math.min(limit * 5, 200) : limit;
  const knn = db
    .prepare(
      "SELECT rowid AS r, distance AS d FROM rag_vectors WHERE embedding MATCH ? AND collection = ? AND k = ? ORDER BY distance"
    )
    .all(toFloat32(qvec), collection, k) as { r: number; d: number }[];

  if (knn.length === 0) {
    return { collection, query, results: [] };
  }

  const placeholders = knn.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT rowid AS r, doc_id, chunk_index, content, metadata FROM rag_chunks WHERE rowid IN (${placeholders})`
    )
    .all(...knn.map((x) => x.r)) as {
      r: number;
      doc_id: string;
      chunk_index: number;
      content: string;
      metadata: string | null;
    }[];

  const byRow = new Map(rows.map((r) => [r.r, r]));
  const distByRow = new Map(knn.map((x) => [x.r, x.d]));

  const merged: SearchResult[] = [];
  for (const x of knn) {
    const row = byRow.get(x.r);
    if (!row) continue;
    const meta = parseJson(row.metadata);
    if (params.filter && !matchesFilter(meta, params.filter)) continue;
    merged.push({
      content: row.content,
      distance: distByRow.get(x.r) ?? null,
      metadata: meta,
      doc_id: row.doc_id,
      chunk_index: row.chunk_index,
    });
    if (merged.length >= limit) break;
  }

  return { collection, query, results: merged };
}

function matchesFilter(meta: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(filter)) {
    if (meta[key] !== val) {
      if (typeof meta[key] === "string" && typeof val === "string") {
        if (!meta[key].includes(val)) return false;
      } else {
        return false;
      }
    }
  }
  return true;
}

export function ragList(params: { collection: string; limit?: number }): {
  collection: string;
  count: number;
  documents: { doc_id: string; chunks: number; metadata: Record<string, unknown> }[];
} {
  const { collection } = params;
  if (!collection) throw new Error("ragList requires collection");
  const limit = Math.max(1, Math.min(params.limit ?? 50, 1000));
  const db = getDb();

  const total = (
    db.prepare("SELECT COUNT(DISTINCT doc_id) AS c FROM rag_chunks WHERE collection = ?").get(collection) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `SELECT doc_id, COUNT(*) AS chunks, MIN(metadata) AS metadata
       FROM rag_chunks WHERE collection = ?
       GROUP BY doc_id
       ORDER BY MIN(created_at) DESC
       LIMIT ?`
    )
    .all(collection, limit) as { doc_id: string; chunks: number; metadata: string | null }[];

  return {
    collection,
    count: total,
    documents: rows.map((r) => ({
      doc_id: r.doc_id,
      chunks: r.chunks,
      metadata: parseJson(r.metadata),
    })),
  };
}

export function ragDelete(params: { collection: string; id: string }): {
  collection: string;
  deleted: number;
} {
  const { collection, id } = params;
  if (!collection || !id) throw new Error("ragDelete requires collection and id");
  const db = getDb();

  const rowids = (
    db.prepare("SELECT rowid AS r FROM rag_chunks WHERE collection = ? AND doc_id = ?").all(collection, id) as {
      r: number;
    }[]
  ).map((x) => x.r);

  const tx = db.transaction((rs: number[]) => {
    const dv = db.prepare("DELETE FROM rag_vectors WHERE rowid = ?");
    const dc = db.prepare("DELETE FROM rag_chunks WHERE rowid = ?");
    for (const r of rs) {
      dv.run(r);
      dc.run(r);
    }
  });
  tx(rowids);

  return { collection, deleted: rowids.length };
}

export function ragCollections(): { collections: CollectionInfo[] } {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT collection AS name, COUNT(DISTINCT doc_id) AS docs, COUNT(*) AS chunks
       FROM rag_chunks GROUP BY collection ORDER BY name`
    )
    .all() as { name: string; docs: number; chunks: number }[];
  return {
    collections: rows.map((r) => ({ name: r.name, count: r.docs })),
  };
}
