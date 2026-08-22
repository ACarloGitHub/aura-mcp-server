# Architecture (v3.1)

AuraMCP Server is a thin TypeScript process that speaks MCP over stdio. The host (AnythingLLM or LM Studio) spawns one instance per workspace and sends JSON-RPC requests.

## Pipeline

```
host (AnythingLLM / LM Studio)
  │  initialize
  │  tools/list ─────────► TOOLS array (12 entries)
  │  tools/call ─────────► dispatcher ──► tool module ──► content + structuredContent
  │
  ▼
stdio (MCP SDK 1.29)
  │
auramcp-server (Node.js, ESM)
  ├─ src/index.ts                # server + dispatch
  ├─ src/utils/                  # helpers + permissions + truncate + resultWrapper
  └─ src/tools/                  # 12 tool implementations
```

## Tool surface (v3.0)

12 entries in `tools/list`. Each entry has `name`, `description` (≤ 120 chars), `inputSchema`. Entries that take `action` declare it as an enum.

| # | Name | action enum | has `outputSchema` |
|---|---|---|---|
| 1 | `file` | `read` \| `write` \| `edit` \| `list` | no |
| 2 | `exec` | `run` \| `background` | no |
| 3 | `exec_job` | `poll` \| `kill` \| `list` \| `clean` | yes (poll) |
| 4 | `web_search` | — | yes |
| 5 | `wiki` | `search` \| `read` \| `write` \| `list` | yes (list) |
| 6 | `wiki_ingest` | `ingest` \| `ingest_wiki` \| `query` \| `lint` \| `update_index` \| `update_log` | no |
| 7 | `rag` | `search` \| `add` \| `list` \| `delete` \| `collections` \| `ingest_sessions` \| `ingest_anythingllm` | yes (search) |
| 8 | `planner` | `create` \| `read` \| `list` \| `update` \| `delete` \| `next` \| `status` | yes (status) |
| 9 | `compact` | `memory` \| `status` \| `list` \| `session` | yes (status) |
| 10 | `anythingllm_chat_exporter` | `list` \| `export` \| `export-all` | no |
| 11 | `notify` | — | no |
| 12 | `permissions` | `grant` \| `revoke` \| `list` \| `clear_session` | no |

The full action enum, parameter schema, and per-tool body limits live in `src/index.ts` and `src/utils/truncate.ts`.

## Result envelope

```ts
{
  content: [{ type: "text", text: "[INSTRUCTION: ...]\n\n<formatted body>" }],
  structuredContent?: { ... typed payload ... },
  isError?: boolean,
}
```

Every multi-line result starts with `[INSTRUCTION: ...]`. The instruction is short, imperative, and addressed to the model. Clients that don't render the instruction hide it by reading `structuredContent` instead.

## Modules

```
src/
├── index.ts          Server bootstrap + TOOLS registry + dispatch
├── utils/
│   ├── helpers.ts        Path resolution, formatError, textResult,
│   │                     appendLogWithRotation (existing).
│   ├── truncate.ts       LIMITS constants + truncate/truncateWithCount (new).
│   ├── resultWrapper.ts  wrapWithInstruction(text, instruction) (new).
│   ├── permissions.ts    resolveAllowedPath, resolveAllowedPaths,
│   │                     enabledCategories, grantPermission,
│   │                     revokePermission, listPermissions (new).
│   ├── truncate.test.ts  Smoke tests for truncate.
│   └── permissions.test.ts Smoke tests for permissions.
└── tools/
    ├── file.ts             dispatch read|write|edit|list (new)
    ├── exec.ts             run|background + underlying impl (extended)
    ├── exec_job.ts         dispatch poll|kill|list|clean (new)
    ├── exec-safety.ts      deny-list checkCommandSafety (new)
    ├── webSearch.ts        DuckDuckGo Lite POST (existing, instruction-prefixed)
    ├── wiki.ts             search|read|write|list (existing, instruction-prefixed, structuredContent for list)
    ├── wiki_ingest.ts      ingest|ingest_wiki|query|lint|update_index|update_log
    ├── rag.ts              search|add|list|delete|collections|ingest_sessions|ingest_anythingllm
    ├── planner.ts          create|read|list|update|delete|next|status
    ├── compact.ts          memory|status|list|session (structuredContent for status)
    ├── anythingllm.ts      anythingllm_chat_exporter: list|export|export-all + ingest for RAG
    ├── notify.ts           desktop notification
    ├── permissions.ts      grant|revoke|list|clear_session (new)
    ├── read.ts / write.ts / edit.ts / list_dir.ts  thin targets for file()
    └── *.test.ts           node-runnable smoke tests
```

Chat capture is client-specific and documented in the server `instructions` (set on the
`Server` options) so the agent knows the cross-tool priorities: `compact(session)` and
`rag(ingest_sessions)` are **LM Studio only** (read `.conversation.json` from disk);
`anythingllm_chat_exporter` and `rag(ingest_anythingllm)` are **AnythingLLM only**
(read chats via the AnythingLLM API).

## Permissions + categories

Before dispatch, `src/index.ts` calls `resolveAllowedPaths(args, [...path keys])` against `src/utils/permissions.ts`. The check accepts paths inside `AGENT_WORKSPACE`, entries in `AURA_ALLOWED_PATHS`, and entries in the permission store (session or always). If a path is not allowed, the server returns a `pendingApproval` message instructing the agent to ask the user for permission and use the `permissions` tool to grant access.

`src/index.ts` `main()` reads `AURA_ENABLED_CATEGORIES` once and filters `TOOLS` accordingly. No runtime reload — restart the server to change.

## Result flow

```
host ──► CallToolRequest(name, args)
              │
              ▼
        resolveAllowedPaths(args, path-keys)  ─── pendingApproval if outside WS
              │
              ▼
        switch (name)
              │
              ▼
        toolModule(args)
              │
              ├── formatting, truncation (LIMITS)
              ├── wrapWithInstruction(text, instruction)
              ├── for stable-shape tools: structuredContent = { ... }
              │
              ▼
        result envelope → host
```

## See also

- [setup.md](setup.md) — install + host wiring.
- [env-vars.md](env-vars.md) — configuration knobs.
- [TOOLS.md](../TOOLS.md) — tool reference.
- [wiki.md](wiki.md), [compaction.md](compaction.md), [planner.md](planner.md) — domain docs.