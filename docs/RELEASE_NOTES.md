# Release Notes

## v3.0.0 (2026-07-07)

The headline change in v3.0 is a **breaking** consolidation: the v2.x tool surface had 39 granular entries (each function a separate tool name); v3.0 ships **11** consolidated tools, most with an `action` enum.

### Highlights

- **11 consolidated tools.** Down from 39.
- **`[INSTRUCTION: ...]` prefixes** on every multi-line tool result, telling the model how to summarize for the user.
- **Per-type truncation** (`LIMITS` in `src/utils/truncate.ts`): web snippet 300, RAG chunk 500, wiki body 4,000, file body 10,000, exec output 200,000.
- **`outputSchema` + `structuredContent`** on six stable-shape tools: `web_search`, `rag`, `planner(status)`, `exec_job(poll)`, `wiki(list)`, `compact(status)`. Mirrored in `content[0].text` for clients that ignore `structuredContent`.
- **Sandbox.** `file`/`wiki` reject absolute paths outside `AGENT_WORKSPACE` unless listed in `AURA_ALLOWED_PATHS` (Windows `;` / POSIX `:`).
- **Category filter.** `AURA_ENABLED_CATEGORIES` selects a subset of the 11 tool names at boot.
- **Exec deny-list.** Refuses `rm -rf /`, `format C:`, `del /f /s /q C:\`, `mkfs /dev/...`, `dd of=/dev/...`. Override with `AURA_DISABLE_EXEC_DENYLIST=1` (not recommended).
- **Compact descriptions.** Every `description` is one sentence ending in "Use for: ..."; max 120 chars.
- **Updated docs**. README, TOOLS.md, docs/env-vars.md, docs/setup.md, docs/wiki.md, docs/compaction.md, docs/planner.md, docs/architecture.md.

### Tools (final list)

| Name | `action` values | `outputSchema` |
|---|---|---|
| `file` | `read` \| `write` \| `edit` \| `list` | — |
| `exec` | `run` \| `background` | — |
| `exec_job` | `poll` \| `kill` \| `list` \| `clean` | yes (poll) |
| `web_search` | — | yes |
| `wiki` | `search` \| `read` \| `write` \| `list` | yes (list) |
| `wiki_ingest` | `ingest` \| `query` \| `lint` \| `update_index` \| `update_log` | — |
| `rag` | `search` \| `add` \| `list` \| `delete` \| `collections` \| `ingest_sessions` | yes (search) |
| `planner` | `create` \| `read` \| `list` \| `update` \| `delete` \| `next` \| `status` | yes (status) |
| `compact` | `memory` \| `status` \| `list` | yes (status) |
| `anythingllm` | `list` \| `export` \| `export-all` | — |
| `notify` | — | — |

### New environment variables

| Variable | Default | Description |
|---|---|---|
| `AURA_ALLOWED_PATHS` | empty | Opt-in absolute paths outside `AGENT_WORKSPACE` (`:` POSIX, `;` Windows). |
| `AURA_ENABLED_CATEGORIES` | all 11 | Comma-separated whitelist of tool names. Boot-time filter; no runtime reload. |
| `AURA_DISABLE_EXEC_DENYLIST` | unset | When `1`, the catastrophic-pattern check in `exec` is skipped. |

### Breaking changes from v2.x

The granular names `read`, `write`, `edit`, `list_dir`, `wiki_search`, `wiki_read`, `wiki_write`, `wiki_list`, `wiki_ingest_raw`, `wiki_ingest_query`, `wiki_ingest_lint`, `wiki_ingest_update_index`, `wiki_ingest_update_log`, `rag_search`, `rag_add`, `rag_list`, `rag_delete`, `rag_collections`, `rag_ingest_sessions`, `planner_create`, `planner_read`, `planner_list`, `planner_update`, `planner_delete`, `planner_next`, `planner_status`, `compact_memory`, `compact_status`, `compact_list`, `anythingllm_list`, `anythingllm_export`, `anythingllm_export_all`, `exec_poll`, `exec_kill`, `exec_list`, `exec_clean` **no longer exist**. The server returns `Unknown tool: <name>` for any pre-v3.0 call.

Update host-side config and prompts to the consolidated shape. AnythingLLM and LM Studio reload the descriptor list when the server restarts; no manual host edit required beyond that.

`exec` keeps the legacy `background: true` flag for compatibility; new code should use `action="background"`.

### Notes

- The plan originally targeted 36 tools; the v2.1.0 baseline actually exposed 39 (the four `read|write|edit|list_dir` granular aliases in addition to the wiki/rag family). v3.0 collapses all 39 to 11.
- Description length target in the plan (≥40% average reduction) was not hit (~13% instead): the "Use for: ..." suffix + already-short v2.1 descriptions made aggressive shrinking impractical. The ≤120 char ceiling is met.
- No new npm dependencies. `@modelcontextprotocol/sdk` 1.29 (already installed) supports `outputSchema`/`structuredContent`.
- `docs/Old/` is preserved as the v2.1.0 archive; do not edit.
