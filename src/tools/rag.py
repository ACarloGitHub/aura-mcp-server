#!/usr/bin/env python3
"""
RAG Engine — Python backend for ChromaDB + embeddings via Ollama (nomic-embed-text).
No dependency on llama-cpp-python. Uses the local Ollama API for embeddings.
Called by the MCP server TypeScript tools.

Usage:
    python3 rag.py add --collection sessions --id "session-123" --text "content..." --metadata '{"source":"lm-studio","date":"2026-04-24"}'
    python3 rag.py search --collection sessions --query "how to configure GPU" --limit 5
    python3 rag.py list --collection sessions
    python3 rag.py delete --collection sessions --id "session-123"
    python3 rag.py collections
"""

import argparse
import json
import sys
import os
import re
import urllib.request
import urllib.error
from pathlib import Path

import chromadb
from chromadb.config import Settings

# ─── Config ──────────────────────────────────────────────────────────────────
_script_dir = Path(__file__).resolve().parent       # aura-mcp-server/src/tools/
_server_dir = _script_dir.parent.parent               # aura-mcp-server/
_project_root = _server_dir.parent                    # parent workspace dir

BASE_DIR = _server_dir
CHROMA_DIR = str(BASE_DIR / "rag" / "chroma_data")
COLLECTION_NAME = "agent_wiki"
OLLAMA_EMBED_URL = os.environ.get("OLLAMA_EMBED_URL", "http://localhost:11434/api/embeddings")
OLLAMA_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")


def get_embeddings(texts):
    """Generate embeddings using the local Ollama API."""
    results = []
    for text in texts:
        if not text or not text.strip():
            text = "(empty)"
        payload = json.dumps({
            "model": OLLAMA_MODEL,
            "prompt": f"search_document: {text[:2000]}"
        }).encode("utf-8")
        req = urllib.request.Request(
            OLLAMA_EMBED_URL,
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            results.append(data["embedding"])
        except urllib.error.URLError as e:
            raise RuntimeError(f"Ollama connection error ({OLLAMA_EMBED_URL}): {e}")
        except KeyError:
            raise RuntimeError(f"Ollama response missing 'embedding' field: {data}")
    return results


# ─── ChromaDB ─────────────────────────────────────────────────────────────────
def get_chroma_client():
    os.makedirs(CHROMA_DIR, exist_ok=True)
    return chromadb.PersistentClient(
        path=CHROMA_DIR,
        settings=Settings(anonymized_telemetry=False)
    )


# ─── Entity extraction (senza LLM, usa pattern) ──────────────────────
# KNOWN_ENTITIES: customize with the names, projects and places relevant to you.
# These are used to extract and enrich metadata when indexing sessions.
# Add entries in your own language as needed.
KNOWN_ENTITIES = {
    "persons": [
        # Add names of people you interact with, e.g.: "Alice", "Bob"
    ],
    "projects": [
        # Tech tools always useful to recognize
        "AnythingLLM", "LM Studio", "ChromaDB", "Ollama",
        "RAG", "MCP", "nomic-embed-text",
        # Add your own projects, e.g.: "MyProject", "WorkApp"
    ],
    "places": [
        # Add places relevant to you, e.g.: "London", "Berlin"
    ],
    "concepts": [
        "local-first", "zero cloud", "privacy", "RAG", "embedding", "LLM",
        "MCP", "persistent memory", "vector", "semantic", "entities", "ingest",
    ],
}

def _build_patterns():
    patterns = {}
    for category, items in KNOWN_ENTITIES.items():
        sorted_items = sorted(items, key=len, reverse=True)
        escaped = [re.escape(item) for item in sorted_items]
        patterns[category] = re.compile(
            r'(?<!\w)(' + '|'.join(escaped) + r')(?!\w)',
            re.UNICODE
        )
    return patterns

ENTITY_PATTERNS = _build_patterns()
YEAR_PATTERN = re.compile(r'\b(19\d{2}|20\d{2})\b')

def extract_entities(text):
    entities = {
        "persons": set(),
        "projects": set(),
        "places": set(),
        "key_concepts": [],
        "year": "",
    }
    for category, pattern in ENTITY_PATTERNS.items():
        for match in pattern.finditer(text):
            val = match.group(1).strip()
            if category == "persons":
                entities["persons"].add(val)
            elif category == "projects":
                entities["projects"].add(val)
            elif category == "places":
                entities["places"].add(val)
            elif category == "concepts":
                if val not in entities["key_concepts"]:
                    entities["key_concepts"].append(val)
    years = YEAR_PATTERN.findall(text)
    if years:
        entities["year"] = max(set(years), key=years.count)
    entities["persons"] = sorted(entities["persons"])[:15]
    entities["projects"] = sorted(entities["projects"])[:10]
    entities["places"] = sorted(entities["places"])[:5]
    entities["key_concepts"] = entities["key_concepts"][:5]
    return entities


# ─── Comandi ──────────────────────────────────────────────────────────────────
def cmd_add(args):
    client = get_chroma_client()
    collection = client.get_or_create_collection(
        name=args.collection,
        metadata={"hnsw:space": "cosine"}
    )
    metadata = {}
    if args.metadata:
        try:
            metadata = json.loads(args.metadata)
        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid JSON in metadata"}))
            sys.exit(1)
    if args.collection == "sessions" and args.text.strip():
        ents = extract_entities(args.text)
        if ents["persons"]:
            metadata["entities_persons"] = ",".join(ents["persons"])
        if ents["projects"]:
            metadata["entities_projects"] = ",".join(ents["projects"])
        if ents["places"]:
            metadata["entities_places"] = ",".join(ents["places"])
        if ents["key_concepts"]:
            metadata["entities_concepts"] = ",".join(ents["key_concepts"])
        if ents["year"]:
            metadata["entities_year"] = ents["year"]

    embeddings = get_embeddings([args.text])
    collection.upsert(
        ids=[args.id],
        embeddings=embeddings,
        documents=[args.text],
        metadatas=[metadata]
    )
    result = {
        "status": "added",
        "collection": args.collection,
        "id": args.id,
        "chunks": collection.count()
    }
    print(json.dumps(result, indent=2))


def cmd_add_batch(args):
    client = get_chroma_client()
    collection = client.get_or_create_collection(
        name=args.collection,
        metadata={"hnsw:space": "cosine"}
    )
    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            batch = json.load(f)
    else:
        batch = json.load(sys.stdin)
    ids = [item["id"] for item in batch]
    texts = [item["text"] for item in batch]
    metadatas = [item.get("metadata", {}) for item in batch]
    all_embeddings = []
    batch_size = 8
    for i in range(0, len(texts), batch_size):
        chunk_texts = texts[i:i+batch_size]
        chunk_embs = get_embeddings(chunk_texts)
        all_embeddings.extend(chunk_embs)
    collection.upsert(
        ids=ids,
        embeddings=all_embeddings,
        documents=texts,
        metadatas=metadatas
    )
    result = {
        "status": "added_batch",
        "collection": args.collection,
        "count": len(ids),
        "total_chunks": collection.count()
    }
    print(json.dumps(result, indent=2))


def cmd_search(args):
    client = get_chroma_client()
    collection = client.get_or_create_collection(
        name=args.collection,
        metadata={"hnsw:space": "cosine"}
    )
    query_text = f"search_query: {args.query}"
    query_embedding = get_embeddings([query_text])[0]
    where_filter = None
    if args.filter:
        try:
            where_filter = json.loads(args.filter)
        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid JSON in filter"}))
            sys.exit(1)
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=args.limit,
        where=where_filter,
        include=["documents", "metadatas", "distances"]
    )
    output = []
    for i in range(len(results["ids"][0])):
        item = {
            "id": results["ids"][0][i],
            "text": results["documents"][0][i] if results["documents"] else None,
            "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
            "distance": results["distances"][0][i] if results["distances"] else None,
        }
        output.append(item)
    print(json.dumps({"results": output, "collection": args.collection, "query": args.query}, indent=2))


def cmd_list(args):
    client = get_chroma_client()
    try:
        collection = client.get_collection(name=args.collection)
    except Exception:
        print(json.dumps({"error": f"Collection '{args.collection}' not found"}))
        sys.exit(1)
    count = collection.count()
    limit = min(args.limit, count) if args.limit else count
    if limit == 0:
        print(json.dumps({"collection": args.collection, "count": 0, "documents": []}))
        return
    results = collection.get(limit=limit, include=["metadatas"])
    docs = []
    for i in range(len(results["ids"])):
        docs.append({"id": results["ids"][i], "metadata": results["metadatas"][i] if results["metadatas"] else {}})
    print(json.dumps({"collection": args.collection, "count": count, "documents": docs}, indent=2))


def cmd_delete(args):
    client = get_chroma_client()
    try:
        collection = client.get_collection(name=args.collection)
    except Exception:
        print(json.dumps({"error": f"Collection '{args.collection}' not found"}))
        sys.exit(1)
    collection.delete(ids=[args.id])
    print(json.dumps({"status": "deleted", "collection": args.collection, "id": args.id}))


def cmd_collections(args):
    client = get_chroma_client()
    collections = client.list_collections()
    result = []
    for col in collections:
        try:
            count = col.count()
        except:
            count = "unknown"
        result.append({"name": col.name, "count": count})
    print(json.dumps({"collections": result}, indent=2))


def main():
    parser = argparse.ArgumentParser(description="RAG Engine - ChromaDB + Ollama embeddings")
    subparsers = parser.add_subparsers(dest="command", help="Command")
    add_parser = subparsers.add_parser("add", help="Add a document")
    add_parser.add_argument("--collection", required=True, help="Collection name")
    add_parser.add_argument("--id", required=True, help="Document ID")
    add_parser.add_argument("--text", required=True, help="Document text")
    add_parser.add_argument("--metadata", help="JSON metadata")
    batch_parser = subparsers.add_parser("add_batch", help="Add multiple documents")
    batch_parser.add_argument("--collection", required=True, help="Collection name")
    batch_parser.add_argument("--file", help="JSON file with batch data")
    search_parser = subparsers.add_parser("search", help="Search similar documents")
    search_parser.add_argument("--collection", required=True, help="Collection name")
    search_parser.add_argument("--query", required=True, help="Search query")
    search_parser.add_argument("--limit", type=int, default=5, help="Max results")
    search_parser.add_argument("--filter", help="JSON where filter")
    list_parser = subparsers.add_parser("list", help="List documents in collection")
    list_parser.add_argument("--collection", required=True, help="Collection name")
    list_parser.add_argument("--limit", type=int, default=100, help="Max documents")
    delete_parser = subparsers.add_parser("delete", help="Delete a document")
    delete_parser.add_argument("--collection", required=True, help="Collection name")
    delete_parser.add_argument("--id", required=True, help="Document ID")
    subparsers.add_parser("collections", help="List all collections")
    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)
    commands = {
        "add": cmd_add, "add_batch": cmd_add_batch,
        "search": cmd_search, "list": cmd_list,
        "delete": cmd_delete, "collections": cmd_collections,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()