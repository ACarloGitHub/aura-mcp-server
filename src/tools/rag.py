#!/usr/bin/env python3
"""
RAG Engine — Python backend for ChromaDB + embeddings via LM Studio.
Called by the MCP server's TypeScript tools.

Usage:
    python3 rag.py add --collection sessions --id "session-123" --text "content..." --metadata '{"source":"lm-studio","date":"2026-04-24"}'
    python3 rag.py search --collection sessions --query "how to configure GPU" --limit 5
    python3 rag.py list --collection sessions
    python3 rag.py delete --collection sessions --id "session-123"
    python3 rag.py collections
    python3 rag.py extract_entities --id "session-123" --text "long text..."
"""

import argparse
import json
import sys
import os
import re
import threading
import requests

# Configuration from environment
WORKSPACE = os.environ.get("AGENT_WORKSPACE", os.getcwd())
CHROMA_DIR = os.environ.get("CHROMA_DATA_DIR", os.path.join(WORKSPACE, "rag", "chroma_data"))
LM_STUDIO_URL = os.environ.get("LM_STUDIO_URL", "http://localhost:1234")
EMBEDDINGS_URL = f"{LM_STUDIO_URL}/v1/embeddings"
LM_STUDIO_CHAT_URL = f"{LM_STUDIO_URL}/v1/chat/completions"
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "nomic-ai/nomic-embed-text-v1.5-GGUF")


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Get embeddings from LM Studio's embedding model."""
    try:
        resp = requests.post(EMBEDDINGS_URL, json={
            "model": EMBEDDING_MODEL,
            "input": texts
        }, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        sorted_data = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in sorted_data]
    except Exception as e:
        print(json.dumps({"error": f"Embedding failed: {e}"}), file=sys.stderr)
        sys.exit(1)


def get_chroma_client():
    """Get or create ChromaDB persistent client."""
    import chromadb
    os.makedirs(CHROMA_DIR, exist_ok=True)
    return chromadb.PersistentClient(path=CHROMA_DIR)


def extract_entities_from_text(text: str) -> list[dict]:
    """
    Call the LM Studio model to extract entities from text.
    Returns [{name, type, description}].
    Fire-and-forget: returns empty list on failure.
    """
    max_chars = 8000
    input_text = text[:max_chars]

    prompt = f"""Extract the main entities from the following text. Entities are: people, software tools, projects, technical concepts, organizations, places.

For each entity provide:
- name: entity name
- type: one of person, tool, project, concept, organization, place
- description: brief description (max 100 chars)

Reply with ONLY a JSON array, nothing else. Example:
[{{"name": "Python", "type": "tool", "description": "Programming language"}}]

TEXT:
{input_text}

JSON:"""

    try:
        resp = requests.post(LM_STUDIO_CHAT_URL, json={
            "model": "",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 2000,
            "temperature": 0.1,
        }, timeout=120)

        resp.raise_for_status()
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

        if not content.strip():
            return []

        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
        if json_match:
            content = json_match.group(1).strip()

        entities = json.loads(content)
        if not isinstance(entities, list):
            return []
        return entities
    except Exception:
        return []


def auto_extract_entities(doc_id: str, text: str):
    """
    Extract entities from text and add them to the 'entities' collection.
    Runs in a separate thread (fire-and-forget).
    """
    try:
        entities = extract_entities_from_text(text)
        if not entities:
            return

        client = get_chroma_client()
        collection = client.get_or_create_collection(
            name="entities",
            metadata={"hnsw:space": "cosine"}
        )

        texts = []
        ids = []
        metadatas = []

        for ent in entities:
            name = ent.get("name", "").strip()
            etype = ent.get("type", "concept")
            desc = ent.get("description", "")

            if not name:
                continue

            entity_text = f"{name} ({etype}): {desc}"
            entity_id = f"entity_{doc_id}_{name.lower().replace(' ', '_')}"

            texts.append(entity_text)
            ids.append(entity_id)
            metadatas.append({
                "source": doc_id,
                "entity_name": name,
                "entity_type": etype,
                "description": desc,
            })

        if not texts:
            return

        embeddings = get_embeddings(texts)
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )
        print(f"  Extracted {len(ids)} entities from source {doc_id}", file=sys.stderr)
    except Exception:
        pass  # Never block the main operation


def cmd_add(args):
    """Add a document to a collection. Auto-extracts entities if collection=sessions."""
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

    # Auto-extract entities (non-blocking, only for sessions)
    if args.collection == "sessions" and args.text.strip():
        t = threading.Thread(target=auto_extract_entities, args=(args.id, args.text), daemon=True)
        t.start()


def cmd_add_batch(args):
    """Add multiple documents at once. Auto-extracts entities if collection=sessions."""
    client = get_chroma_client()
    collection = client.get_or_create_collection(
        name=args.collection,
        metadata={"hnsw:space": "cosine"}
    )

    if args.file:
        with open(args.file, "r") as f:
            batch = json.load(f)
    else:
        batch = json.load(sys.stdin)

    ids = [item["id"] for item in batch]
    texts = [item["text"] for item in batch]
    metadatas = [item.get("metadata", {}) for item in batch]

    all_embeddings = []
    batch_size = 32
    for i in range(0, len(texts), batch_size):
        chunk = texts[i:i+batch_size]
        embs = get_embeddings(chunk)
        all_embeddings.extend(embs)

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

    # Auto-extract entities (non-blocking, only for sessions)
    if args.collection == "sessions":
        for i, doc_id in enumerate(ids):
            if texts[i].strip():
                t = threading.Thread(target=auto_extract_entities, args=(doc_id, texts[i]), daemon=True)
                t.start()


def cmd_extract_entities(args):
    """
    Manual command: extract entities from existing RAG documents.
    Useful as a fallback if auto-extraction failed.
    """
    if not args.id and not args.text:
        if not args.collection:
            print(json.dumps({"error": "Specify --id or --collection"}))
            sys.exit(1)

        client = get_chroma_client()
        try:
            collection = client.get_collection(name=args.collection)
        except Exception:
            print(json.dumps({"error": f"Collection '{args.collection}' not found"}))
            sys.exit(1)

        limit = args.limit or 10
        results = collection.get(limit=limit)

        count = 0
        for i in range(len(results["ids"])):
            doc_id = results["ids"][i]
            doc_text = results["documents"][i] if results["documents"] else ""
            if doc_text.strip():
                auto_extract_entities(doc_id, doc_text)
                count += 1

        print(json.dumps({"status": "extracted", "documents_processed": count}))
        return

    if not args.id:
        args.id = "manual_entity_extraction"

    text = args.text or ""
    if not text.strip():
        print(json.dumps({"error": "Specify --text with content to analyze"}))
        sys.exit(1)

    auto_extract_entities(args.id, text)
    print(json.dumps({"status": "entities_extracted", "source": args.id}))


def cmd_search(args):
    """Search for similar documents."""
    client = get_chroma_client()

    try:
        collection = client.get_collection(name=args.collection)
    except Exception:
        print(json.dumps({"error": f"Collection '{args.collection}' not found"}))
        sys.exit(1)

    query_embedding = get_embeddings([args.query])[0]

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
    """List documents in a collection."""
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

    results = collection.get(
        limit=limit,
        include=["metadatas"]
    )

    docs = []
    for i in range(len(results["ids"])):
        docs.append({
            "id": results["ids"][i],
            "metadata": results["metadatas"][i] if results["metadatas"] else {}
        })

    print(json.dumps({"collection": args.collection, "count": count, "documents": docs}, indent=2))


def cmd_delete(args):
    """Delete a document from a collection."""
    client = get_chroma_client()

    try:
        collection = client.get_collection(name=args.collection)
    except Exception:
        print(json.dumps({"error": f"Collection '{args.collection}' not found"}))
        sys.exit(1)

    collection.delete(ids=[args.id])

    print(json.dumps({"status": "deleted", "collection": args.collection, "id": args.id}))


def cmd_collections(args):
    """List all collections."""
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
    parser = argparse.ArgumentParser(description="RAG Engine - ChromaDB + LM Studio Embeddings")
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
    list_parser.add_argument("--limit", type=int, default=100, help="Max documents to list")

    delete_parser = subparsers.add_parser("delete", help="Delete a document")
    delete_parser.add_argument("--collection", required=True, help="Collection name")
    delete_parser.add_argument("--id", required=True, help="Document ID")

    extract_parser = subparsers.add_parser("extract_entities", help="Extract entities from documents or a collection")
    extract_parser.add_argument("--collection", help="Collection to extract entities from (processes up to --limit documents)")
    extract_parser.add_argument("--id", help="Document ID (optional, processes entire collection if omitted)")
    extract_parser.add_argument("--text", help="Direct text to analyze (optional, overrides --id)")
    extract_parser.add_argument("--limit", type=int, default=10, help="Max documents to process (default: 10)")

    subparsers.add_parser("collections", help="List all collections")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "add": cmd_add,
        "add_batch": cmd_add_batch,
        "search": cmd_search,
        "list": cmd_list,
        "delete": cmd_delete,
        "collections": cmd_collections,
        "extract_entities": cmd_extract_entities,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
