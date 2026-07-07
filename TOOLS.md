# Tools (v3.0)

The server exposes 11 tools. Ten take an `action` parameter that selects the operation; `web_search` and `notify` do not.

> Per-tool `inputSchema` is the source of truth: this file is a quick lookup. Hosts may render the schema inline.

## file

```json
{ "action": "read|write|edit|list", "path": "...", ... }
```

- `read`: returns text (truncated at 10,000 chars) or an image (`jpg|jpeg|png|gif|webp` up to 2MB). Fields: `path`, optional `offset` (1-based line), `limit` (line count).
- `write`: writes content to disk, creating parent dirs. Fields: `path`, `content`. Max 5MB content.
- `edit`: in-place find/replace (first occurrence). Fields: `path`, `search`, `replace`.
- `list`: lists entries in a directory. Field: `path`.

Returns `Sandbox: ...` with `isError: true` if `path` resolves outside `AGENT_WORKSPACE` and is not in `AURA_ALLOWED_PATHS`.

## exec

```json
{ "action": "run|background", "command": "...", "workdir": "...", "timeout": 360, "env": {} }
```

Runs a shell command via `child_process.spawn` with `shell: true`.

- `action="run"` waits for completion (default timeout 360s, max 7200s).
- `action="background"` returns immediately with a sessionId; poll with `exec_job`.
- Output capped at 200,000 chars (`LIMITS.execOutput`). Over-limit output is truncated with a `[... truncated: N chars]` note.
- The legacy `background: true` flag still works.

A deny-list rejects `rm -rf /`, `format C:`, `del /f /s /q C:\`, `mkfs /dev/...` and `dd of=/dev/...` patterns. Disable with `AURA_DISABLE_EXEC_DENYLIST=1`.

## exec_job

```json
{ "action": "poll|kill|list|clean", "jobId": "...", "tail": 100, "maxAgeHours": 24, "all": false }
```

- `poll`: returns the tail of stdout/stderr (default 100 lines, configurable via `tail`). Includes `structuredContent` with `{ jobId, running, exitCode, pid, command, startedAt, stdoutTail, stderrTail }`.
- `kill`: sends `SIGTERM` to a running job.
- `list`: lists all jobs (running and completed) with status and age.
- `clean`: removes completed job files older than `maxAgeHours` (default 24). Set `all: true` to remove everything.

## web_search

```json
{ "query": "...", "count": 5 }
```

Searches the web via DuckDuckGo Lite (POST). Each snippet is truncated at 300 chars (`LIMITS.webSnippet`). `structuredContent` carries `{ engine: "duckduckgo", query, count, results: [{title,url,snippet}] }`.

## wiki

```json
{ "action": "search|read|write|list", "query": "...", "path": "...", "content": "...", "maxResults": 10 }
```

Manage the local `Wiki/` directory under `AGENT_WORKSPACE`.

- `search`: full-text search. Snippets capped at 300 chars (`LIMITS.wikiSnippet`).
- `read`: returns page body, capped at 4,000 chars (`LIMITS.wikiBody`).
- `write`: creates or overwrites a page (markdown).
- `list`: lists pages with title and modified date. `structuredContent` carries `{ total, shown, pages: [{path,title,modified}] }`.

## wiki_ingest

```json
{ "action": "ingest|query|lint|update_index|update_log", "source": "...", "query_text": "..." }
```

Curate the structured knowledge graph (Karpathy-style).

- `ingest`: load a raw file (path in `source`) and return its content with role-reminder instructions.
- `query`: surface the wiki index (used as input to `wiki(action=search|read)`).
- `lint`: integrity check (frontmatter, orphan pages, confidence).
- `update_index`: rebuild `wiki/index.md` from the on-disk markdown.
- `update_log`: append an entry to `wiki/log.md`.

## rag

```json
{ "action": "search|add|list|delete|collections|ingest_sessions", "collection": "...", "query": "...", "id": "...", "text": "...", "metadata": "...", "limit": 5, "filter": "..." }
```

Semantic search via ChromaDB with Ollama embeddings.

- `search`: returns chunks ordered by distance. Snippet per chunk capped at 500 chars (`LIMITS.ragChunk`). `structuredContent` carries `{ collection, query, count, results: [{text,distance,metadata}] }`.
- `add`/`delete`: idempotent on document ID.
- `list`: lists documents in a collection.
- `collections`: lists all collections.
- `ingest_sessions`: indexes AnythingLLM session exports; re-index with `reindex: true`.

## planner

```json
{ "action": "create|read|list|update|delete|next|status", "name": "...", "content": "...", "answer": "..." }
```

Phased plans stored under `plans/`. Tasks are GitHub-style checkbox lines (`- [ ]`/`- [x]`). Blocking questions use `- [ ] Question: ...`.

- `next`: advances the first unchecked task, OR if a blocking question exists, expects an `answer`.
- `status`: returns `{name,total,completed,remaining,percentage,blockingQuestion}` as `structuredContent`.

## compact

```json
{ "action": "memory|status|list", "threshold": 300 }
```

- `memory`: archives the body of `MEMORY.md` into `memory-archive.md` when above the line threshold, then rewrites `MEMORY.md` with a pointer.
- `status`: returns `{memory, archive, compactedSessions}` as `structuredContent`.
- `list`: lists already-compacted sessions.

## anythingllm

```json
{ "action": "list|export|export-all", "workspace": "...", "thread": "...", "apiKey": "..." }
```

Exports chats from a running AnythingLLM instance (`http://localhost:3001` by default; override with `ANYTHINGLLM_BASE_URL`).

- `list`: lists all workspaces and threads.
- `export`: exports one workspace (optionally one thread) to a markdown file in `AnythingLLMSessions/`.
- `export-all`: bulk exports all workspaces.

Requires either the `apiKey` argument, `ANYTHINGLLM_API_KEY` env var, or `api-key.json` in the server directory.

## notify

```json
{ "message": "...", "title": "...", "sound": true }
```

Desktop notification with optional beep. Falls back through `node-notifier` → WinRT toast → System.Windows.Forms.NotifyIcon on Windows. Other platforms use stdout ASCII bell.
