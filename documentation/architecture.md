# Architecture (v3.1)

AuraMCP Server is a thin TypeScript process that speaks MCP over stdio. The host (AnythingLLM or LM Studio) spawns one instance per workspace and sends JSON-RPC requests.

## Pipeline

```
host (AnythingLLM / LM Studio)
  │  initialize
  │  tools/list ─────────► TOOLS array (11 entries)
  │  tools/call ─────────► dispatcher ──► tool module ──► content + structuredContent
  │
  ▼
stdio (MCP SDK 1.29)
  │
auramcp-server (Node.js, ESM)
  ├─ src/index.ts                # server + dispatch
  ├─ src/utils/                  # helpers + sandbox + truncate + resultWrapper
  └─ src/tools/                  # 11 tool implementations
```

## Tool surface (v3.0)

11 entries in `tools/list`. Each entry has `name`, `description` (≤ 120 chars), `inputSchema`. Entries that take `action` declare it as an enum.

| # | Name | action enum | has `outputSchema` |
|---|---|---|---|
| 1 | `file` | `read` \| `write` \| `edit` \| `list` | no |
| 2 | `exec` | `run` \| `background` | no |
| 3 | `exec_job` | `poll` \| `kill` \| `list` \| `clean` | yes (poll) |
| 4 | `web_search` | — | yes |
| 5 | `wiki` | `search` \| `read` \| `write` \| `list` | yes (list) |
| 6 | `wiki_ingest` | `ingest` \| `query` \| `lint` \| `update_index` \| `update_log` | no |
| 7 | `rag` | `search` \| `add` \| `list` \| `delete` \| `collections` \| `ingest_sessions` | yes (search) |
| 8 | `planner` | `create` \| `read` \| `list` \| `update` \| `delete` \| `next` \| `status` | yes (status) |
| 9 | `compact` | `memory` \| `status` \| `list` | yes (status) |
| 10 | `anythingllm` | `list` \| `export` \| `export-all` | no |
| 11 | `notify` | — | no |

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
│   ├── sandbox.ts        resolveAllowedPath, resolveAllowedPaths,
│   │                     enabledCategories (new).
│   ├── truncate.test.ts  Smoke tests for truncate.
│   └── sandbox.test.ts   Smoke tests for sandbox.
└── tools/
    ├── file.ts             dispatch read|write|edit|list (new)
    ├── exec.ts             run|background + underlying impl (extended)
    ├── exec_job.ts         dispatch poll|kill|list|clean (new)
    ├── exec-safety.ts      deny-list checkCommandSafety (new)
    ├── webSearch.ts        DuckDuckGo Lite POST (existing, instruction-prefixed)
    ├── wiki.ts             search|read|write|list (existing, instruction-prefixed, structuredContent for list)
    ├── wiki_ingest.ts      ingest|query|lint|update_index|update_log
    ├── rag.ts              search|add|list|delete|collections|ingest_sessions
    ├── planner.ts          create|read|list|update|delete|next|status
    ├── compact.ts          memory|status|list (structuredContent for status)
    ├── anythingllm.ts      list|export|export-all
    ├── notify.ts           desktop notification
    ├── read.ts / write.ts / edit.ts / list_dir.ts  thin targets for file()
    └── *.test.ts           node-runnable smoke tests
```

## Sandbox + categories

Before dispatch, `src/index.ts` calls `resolveAllowedPaths(args, [...path keys])` against `src/utils/sandbox.ts`. The check accepts paths inside `AGENT_WORKSPACE` and entries in `AURA_ALLOWED_PATHS`; everything else returns `isError: true`.

`src/index.ts` `main()` reads `AURA_ENABLED_CATEGORIES` once and filters `TOOLS` accordingly. No runtime reload — restart the server to change.

## Result flow

```
host ──► CallToolRequest(name, args)
              │
              ▼
        resolveAllowedPaths(args, path-keys)  ─── isError: true if outside WS
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
