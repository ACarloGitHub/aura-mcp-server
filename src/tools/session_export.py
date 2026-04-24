#!/usr/bin/env python3
"""
Export LM Studio sessions → Markdown + ChromaDB indexing.

Reads .conversation.json files from ~/.lmstudio/conversations/,
extracts messages, creates .md files per session, and indexes in ChromaDB.

Usage:
    python3 session_export.py                    # export + index all sessions
    python3 session_export.py --export-only      # markdown export only, no indexing
    python3 session_export.py --folder "FolderName"    # single folder only
    python3 session_export.py --reindex          # re-index everything from scratch
"""

import json
import os
import sys
import argparse
import re
from datetime import datetime, timezone
from pathlib import Path

# Configuration from environment
WORKSPACE = os.environ.get("AGENT_WORKSPACE", os.getcwd())
CONVERSATIONS_DIR = os.environ.get(
    "LM_STUDIO_CONVERSATIONS_DIR",
    os.path.expanduser("~/.lmstudio/conversations")
)
EXPORT_DIR = os.environ.get(
    "SESSION_EXPORT_DIR",
    os.path.join(WORKSPACE, "session-exports")
)
RAG_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rag.py")


def parse_conversation(filepath: str) -> dict | None:
    """Parse a .conversation.json file and extract structured data."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"  ERROR reading {filepath}: {e}", file=sys.stderr)
        return None

    messages = []

    raw_messages = data.get("messages", [])
    for msg in raw_messages:
        versions = msg.get("versions", [])
        if not versions:
            continue

        version = versions[-1]  # Use latest version (currentlySelected)
        role = version.get("role", version.get("type", "unknown"))
        content_text = ""

        if role == "user":
            contents = version.get("content", [])
            parts = []
            if isinstance(contents, list):
                for c in contents:
                    if isinstance(c, dict):
                        t = c.get("text", c.get("content", ""))
                        if t:
                            parts.append(str(t))
                    elif isinstance(c, str):
                        parts.append(c)
            elif isinstance(contents, str):
                parts.append(contents)
            content_text = " ".join(parts)

        elif role == "assistant":
            steps = version.get("steps", [])
            step_texts = []
            for step_idx, step in enumerate(steps):
                step_content = step.get("content", [])
                if isinstance(step_content, list):
                    for sc in step_content:
                        if isinstance(sc, dict):
                            text = sc.get("text", "")
                            step_type = sc.get("type", "")
                            is_structural = sc.get("isStructural", False)
                            from_draft = sc.get("fromDraftModel", False)
                            if text and step_type not in ("thinking",) and not is_structural:
                                if step_idx == 0 and text.startswith("Here") and "thinking process" in text[:50].lower():
                                    continue
                                step_texts.append(text)
                elif isinstance(step_content, str) and step_content.strip():
                    step_texts.append(step_content)
            content_text = "\n".join(step_texts)

        if content_text.strip():
            messages.append({
                "role": role,
                "content": content_text.strip()
            })

    name = data.get("name", "Untitled")
    created_at = data.get("createdAt", 0)
    token_count = data.get("tokenCount", 0)
    system_prompt = data.get("systemPrompt", "")

    last_used_model = data.get("lastUsedModel", {})
    model_id = last_used_model.get("identifier", "unknown") if isinstance(last_used_model, dict) else "unknown"

    folder = Path(filepath).parent.name
    preset = data.get("preset", "")

    created_date = ""
    if created_at:
        try:
            ts = created_at / 1000 if created_at > 1e12 else created_at
            created_date = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        except Exception:
            created_date = str(created_at)

    return {
        "name": name,
        "folder": folder,
        "created_at": created_at,
        "created_timestamp": created_at,
        "model": model_id,
        "preset": preset,
        "token_count": token_count,
        "system_prompt": system_prompt,
        "messages": messages,
        "filepath": filepath,
    }


def conversation_to_markdown(conv: dict) -> str:
    """Convert a parsed conversation to markdown format."""
    lines = []

    lines.append("---")
    lines.append(f"title: \"{conv['name']}\"")
    lines.append(f"type: session")
    lines.append(f"tags: [lm-studio, session, {conv['folder'].lower().replace(' ', '-')}]")
    lines.append(f"created: {conv['created_at']}")
    lines.append(f"model: {conv['model']}")
    if conv.get('preset'):
        lines.append(f"preset: {conv['preset']}")
    lines.append(f"tokens: {conv['token_count']}")
    lines.append(f"folder: {conv['folder']}")
    lines.append("---")
    lines.append("")
    lines.append(f"# {conv['name']}")
    lines.append("")
    lines.append(f"**Date:** {conv['created_at']}  ")
    lines.append(f"**Model:** {conv['model']}  ")
    if conv.get('preset'):
        lines.append(f"**Preset:** {conv['preset']}  ")
    lines.append(f"**Tokens:** {conv['token_count']}  ")
    lines.append("")

    if conv.get("system_prompt"):
        lines.append("## System Prompt")
        lines.append("")
        lines.append(f"> {conv['system_prompt'][:500]}{'...' if len(conv['system_prompt']) > 500 else ''}")
        lines.append("")

    lines.append("## Conversation")
    lines.append("")

    for msg in conv["messages"]:
        role_label = {
            "user": "**User**",
            "assistant": "**Assistant**",
            "system": "**System**"
        }.get(msg["role"], f"**{msg['role']}**")

        content = msg["content"]
        if len(content) > 2000:
            content = content[:2000] + "\n...[truncated]"

        lines.append(f"{role_label}:")
        lines.append("")
        lines.append(content)
        lines.append("")

    lines.append("---")
    lines.append(f"*Exported on {datetime.now().strftime('%Y-%m-%d %H:%M')} by session_export.py*")

    return "\n".join(lines)


def find_conversations(folder: str | None = None) -> list[str]:
    """Find all .conversation.json files."""
    conversations = []
    base_dir = Path(CONVERSATIONS_DIR)

    if not base_dir.exists():
        print(f"Conversations directory not found: {base_dir}", file=sys.stderr)
        return conversations

    if folder:
        search_dir = base_dir / folder
        if not search_dir.exists():
            print(f"Folder not found: {search_dir}", file=sys.stderr)
            return conversations
        for f in search_dir.glob("*.conversation.json"):
            conversations.append(str(f))
    else:
        for f in base_dir.rglob("*.conversation.json"):
            conversations.append(str(f))

    return sorted(conversations)


def run_rag_command(args: list[str]) -> dict | None:
    """Run a rag.py command and return parsed JSON output."""
    import subprocess
    result = subprocess.run(
        ["python3", RAG_SCRIPT] + args,
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        print(f"  RAG error: {result.stderr}", file=sys.stderr)
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks for better embedding retrieval."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if end < len(text):
            last_period = chunk.rfind(". ")
            if last_period > chunk_size * 0.5:
                chunk = chunk[:last_period + 1]
                end = start + last_period + 1
        chunks.append(chunk.strip())
        start = end - overlap

    return chunks


def index_conversation(conv: dict, reindex: bool = False):
    """Index a conversation's messages into ChromaDB."""
    collection = "sessions"
    conv_id = f"session-{conv['folder']}-{conv['created_timestamp']}"

    full_text_parts = []
    for msg in conv["messages"]:
        role = msg["role"]
        content = msg["content"]
        if role == "user":
            full_text_parts.append(f"User: {content}")
        elif role == "assistant":
            full_text_parts.append(f"Assistant: {content}")

    full_text = "\n\n".join(full_text_parts)

    if not full_text.strip():
        print(f"  Skipped {conv['name']}: no textual content")
        return

    base_metadata = {
        "source": "lm-studio-session",
        "folder": conv["folder"],
        "name": conv["name"][:100],
        "model": conv["model"],
        "date": conv["created_at"],
        "tokens": str(conv["token_count"]),
    }

    chunks = chunk_text(full_text)

    if len(chunks) == 1:
        doc_id = conv_id
        run_rag_command([
            "add", "--collection", collection,
            "--id", doc_id,
            "--text", chunks[0],
            "--metadata", json.dumps(base_metadata)
        ])
    else:
        batch = []
        for i, chunk in enumerate(chunks):
            chunk_id = f"{conv_id}-chunk{i}"
            chunk_meta = {**base_metadata, "chunk": str(i), "total_chunks": str(len(chunks))}
            batch.append({
                "id": chunk_id,
                "text": chunk,
                "metadata": chunk_meta
            })

        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(batch, f, ensure_ascii=False)
            tmp_path = f.name

        run_rag_command([
            "add_batch", "--collection", collection,
            "--file", tmp_path
        ])
        os.unlink(tmp_path)

    print(f"  Indexed {len(chunks)} chunk(s) for '{conv['name']}'")


def main():
    parser = argparse.ArgumentParser(description="Export and index LM Studio sessions")
    parser.add_argument("--export-only", action="store_true", help="Markdown export only, skip indexing")
    parser.add_argument("--folder", type=str, help="Single folder only (e.g. 'FolderName')")
    parser.add_argument("--reindex", action="store_true", help="Re-index everything from scratch")
    args = parser.parse_args()

    conversations = find_conversations(args.folder)
    print(f"Found {len(conversations)} sessions")

    if not conversations:
        print("No sessions found.")
        return

    os.makedirs(EXPORT_DIR, exist_ok=True)

    for conv_path in conversations:
        print(f"\nProcessing: {conv_path}")

        conv = parse_conversation(conv_path)
        if not conv:
            continue

        folder_dir = os.path.join(EXPORT_DIR, conv["folder"])
        os.makedirs(folder_dir, exist_ok=True)

        safe_name = re.sub(r'[^\w\s-]', '', conv["name"]).strip().replace(' ', '_')
        if not safe_name:
            safe_name = f"session_{conv['created_timestamp']}"

        md_filename = f"{safe_name}.md"
        md_path = os.path.join(folder_dir, md_filename)

        md_content = conversation_to_markdown(conv)
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(md_content)

        print(f"  Exported: {md_path}")

        if not args.export_only:
            index_conversation(conv, reindex=args.reindex)

    print(f"\n--- Complete ---")
    print(f"Sessions processed: {len(conversations)}")
    print(f"Markdown exported to: {EXPORT_DIR}/")

    if not args.export_only:
        result = run_rag_command(["collections"])
        if result:
            print(f"ChromaDB status:")
            for col in result.get("collections", []):
                print(f"  {col['name']}: {col['count']} documents")


if __name__ == "__main__":
    main()
