import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { EMBED_DIM, ragDbPath, ragDataDir } from "./config.js";

export type DB = Database.Database;

let _db: DB | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rag_chunks (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_collection ON rag_chunks(collection);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(collection, doc_id);
`;

const VEC_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS rag_vectors USING vec0(
  embedding float[${EMBED_DIM}],
  collection TEXT PARTITION KEY
);
`;

export function getDb(): DB {
  if (_db) return _db;
  const dbPath = ragDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  sqliteVec.load(db);

  db.exec(SCHEMA);
  db.exec(VEC_SCHEMA);

  _db = db;
  return db;
}

export interface RawChunk {
  rowid: number;
  collection: string;
  doc_id: string;
  chunk_index: number;
  content: string;
  metadata: string | null;
}

export interface SearchResult {
  content: string;
  distance: number | null;
  metadata: Record<string, unknown>;
  doc_id: string;
  chunk_index: number;
}

export interface AddResult {
  collection: string;
  doc_id: string;
  chunks: number;
}

export interface CollectionInfo {
  name: string;
  count: number;
}
