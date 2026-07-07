# Implementation plan — aura-mcp-server v3.0

This is the build plan a fresh opencode instance will execute against
the standalone server. Its scope is **only the files inside
`W:\SviluppoProgetti\aura-mcp-server\`**. Anywhere below that mentions
`AuraWrite/…` it means a **read-only reference**, never a write
target.

> **Hard rule.** Do not modify, create, or delete any file under
> `W:\SviluppoProgetti\AuraWrite\`. Treat every path beginning
> `W:\SviluppoProgetti\AuraWrite\` as if the user were reviewing it
> in a second window. The new instance has read access (to study
> lessons learned) and zero write access. If something feels like it
> needs changing in AuraWrite, it does not — re-do it inside
> `aura-mcp-server` instead.

## 0. Inputs (read first, in this order)

| Order | Path | Purpose |
|---|---|---|
| 1 | `docs/aurawrite-improvements.md` | Patterns to port from AuraWrite |
| 2 | `docs/client-requirements.md` | What LM Studio and AnythingLLM need |
| 3 | `docs/Old/architecture.md` | Old architecture map (pre-v3 baseline) |
| 4 | `docs/Old/planner.md` | Old planner doc (planner internal stays the same; format and behaviour, not API surface) |
| 5 | `docs/Old/wiki.md` | Old wiki doc |
| 6 | `docs/Old/compaction.md` | Old compaction doc |
| 7 | `docs/Old/first-boot.md` | First-boot story — unchanged in v3 |
| 8 | `docs/Old/setup.md` | Setup flow (mostly unchanged in v3) |
| 9 | `docs/Old/env-vars.md` | Existing env vars; v3 adds two more |

AuraWrite reference files (READ-ONLY, never modified):

| Order | Path | Used in phase |
|---|---|---|
| 10 | `W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\AuraWrite-Wiki\concepts\tools-consolidation.md` | 1, 2, 3 |
| 11 | `W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\AuraWrite-Wiki\concepts\agent-tools-native.md` | 1, 2, 3, 5 |
| 12 | `W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\src-tauri\src\web_tools.rs` (only lines 1–50, 87–100, 138–235, 281–322, 416–422) | 2, 5 (sample instructions and DDG parser) |
| 13 | `W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\src-tauri\src\planner.rs` (only the `format!` strings visible from grep on `INSTRUCTION`) | 2 |
| 14 | `W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\src-tauri\src\permissions.rs` (only as conceptual reference for `AURA_ALLOWED_PATHS`) | 4 |

> **Constraints applied to every read-only file**:
> - Never edit, even if a typo is spotted.
> - Never copy the file into the worktree.
> - Quoting is fine; modification is not.
> - If you need a long quote, paraphrase or excerpt, never reproduce
>   copyrighted text verbatim.

## 1. Scope of v3.0

Summarised for the executor; the full justification lives in
`aurawrite-improvements.md` and `client-requirements.md`.

- **Reduce exposed tools from 36 to 11.** Consolidate by domain with
  `action` enum: `file`, `exec`, `exec_job`, `web_search`, `wiki`,
  `wiki_ingest`, `rag`, `planner`, `compact`, `anythingllm`,
  `notify`. `web_search` and `notify` have no `action`; the other
  nine take one.
- **Add `[INSTRUCTION: …]` prefixes** to every result of every tool
  that returns one line of content or more.
- **Add per-type truncation** (limits in §3 of the lessons doc).
- **Tighten descriptions**: remove "Params: …" snippets; let the
  schema carry the parameter story.
- **Add `outputSchema` + `structuredContent`** on stable-shape tools
  (`web_search`, `rag`, `planner_status`, `exec_poll`,
  `wiki_list`, `compact_status`).
- **Add `AURA_ALLOWED_PATHS` env var** to let advanced users bypass
  the workspace check, plus a `AURA_ENABLED_CATEGORIES` env var to
  toggle categories without a UI.
- **Add command deny-list** for catastrophic shell patterns.
- **Bump version to 3.0.0** in `package.json` (breaking change to
  the tool surface; old granular names stop working).
- **Rewrite `README.md` and `TOOLS.md`** to reflect the new surface
  and the new env vars.
- **Do NOT introduce** any of: `editor_edit`, `chat_search`,
  `download_image`, `get_document_images`, `save_image_base64`,
  `wiki_stats`, `plan_stats`, `rag_stats`, `chat_stats`,
  `*_reset_all`. Those are specific to AuraWrite's UI/DB story and
  have no equivalent in the standalone server.

## 2. Out of scope

- SSE/HTTP transport.
- OAuth / authentication.
- Sampling or Resources/Prompts support.
- AnythingLLM-specific host features
  (e.g. `anythingllm.autoStart`).
- Changing the protocol version or the stdio transport mechanism.
- Replacing ChromaDB with sqlite-vec (RAG stays as-is for v3.0; that
  is a separate, v3.x concern).
- Anything that would force a write into AuraWrite.

---

## 3. Phased work

Each phase ends with a verification step that must pass before the
next phase begins. None of the phases is large. If a phase is
blocked, stop and ask the human rather than rolling onward.

### Phase 0 — Preparation

1. Confirm `W:\SviluppoProgetti\aura-mcp-server\` is the only path
   with write permission; refuse to run if the workspace looks
   different from the read-only references in `docs/aurawrite-improvements.md`.
2. Install once: `npm ci` (clean install from lockfile).
3. Verify baseline works:
   `npm run check` — TypeScript should pass.
   Manual smoke test: `node dist/index.js` with a mock MCP client
   sending `initialize` then `tools/list`. Save the JSON response to
   `tmp/baseline-tools-list.json` so phase 3 can diff against it.
4. Capture the SDK version actually installed:
   `node -e 'console.log(require("@modelcontextprotocol/sdk/package.json").version)'`.
   Verify it is `>= 1.0`. If lower, do not attempt to add
   `outputSchema`/`structuredContent`; downgrade the relevant phase
   3 expectation to "JSON content only, no `outputSchema`".

**Exit criteria**: a baseline JSON of the current 36 tools is saved.

### Phase 1 — Compact descriptors and add the truncation helper

Touched files (all under `W:\SviluppoProgetti\aura-mcp-server\`):

- `src/utils/truncate.ts` (new).
- `src/utils/truncate.test.ts` (new, one assertion per limit).
- `src/utils/helpers.ts` (no behavioural change; possibly export a
  re-export from `truncate.ts`).
- `src/index.ts` — rewrite each `description` string to be
  parameter-free and ≤ ~120 chars. **No other change in this file
  yet.**

Change description syntax: one full sentence ending in "Use for: …".
Example rewrite of current `read`:

```ts
// before
description: "Read a file. Params: path, offset, limit. Images supported. Files >10MB rejected."

// after
description: "Read a file (text or image). Use for: loading project files into context or fetching images."
```

Truncation helper API (`src/utils/truncate.ts`):

```ts
export const LIMITS = {
  webSnippet: 300,
  ragChunk: 500,
  wikiSnippet: 300,
  wikiBody: 4_000,
  fileBody: 10_000,
  fetchBody: 5_000,
  execOutput: 200_000,
} as const;

export function truncate(s: string, max: number, suffix = "..."): string { ... }
export function truncateWithCount(s: string, max: number): string { ... }
```

`truncateWithCount` returns `<first max chars>\n\n[… truncated: original <total> chars]`.

**Exit criteria**:
- `npm run check` passes.
- Tools list JSON shape unchanged (still 36 entries).
- Average description length shrinks by ≥ 40 % versus baseline.
- `LIMITS` constants are importable from any tool module.

### Phase 2 — Wrap every tool result with `[INSTRUCTION: …]` + truncate

Touched files:

- `src/utils/resultWrapper.ts` (new).
- `src/tools/webSearch.ts` — add `[INSTRUCTION: …]` and
  `LIMITS.webSnippet` to snippets. Sample wording: take it from
  `src-tauri/src/web_tools.rs:142` (READ-ONLY).
- `src/tools/wiki.ts` — same. Sample wording for `wiki_read` from
  `agent-tools-native.md` line 117 (READ-ONLY paragraph). Apply
  `LIMITS.wikiBody` to body, `LIMITS.wikiSnippet` to snippets.
- `src/tools/rag.ts` — `LIMITS.ragChunk` on each snippet.
- `src/tools/planner.ts` — `[INSTRUCTION: …]` on `next` and
  `status`. Sample wording from
  `src-tauri/src/planner.rs:125,140,147,185` (READ-ONLY).
- `src/tools/compact.ts` — `[INSTRUCTION: …]` on
  `compact_status`.
- `src/tools/anythingllm.ts` — wrap `list` and `export_all` results.
- `src/tools/wiki_ingest.ts` — wrap every action.
- `src/tools/read.ts` — apply `LIMITS.fileBody` to text reads.
- `src/tools/write.ts`, `list_dir.ts`, `edit.ts`, `notify.ts` — no
  body change but `notify` benefits from an instruction-style
  confirm message.
- `src/tools/exec.ts` — output is already capped by
  `MAX_OUTPUT_CHARS = 200_000`; add an instruction prefix so the
  model knows to condense the output.

Don't touch:
- `src/index.ts` (other than the description change from phase 1).

**Exit criteria**:
- `npm run check` passes.
- Spot check three tool results manually: each starts with
  `[INSTRUCTION: …]`.
- Snippet/bodies longer than the limit get the
  `[... truncated: N chars]` note.
- **No tool registry change.** The 36 tool names are still the same.
  This phase is internal-only.

### Phase 3 — Consolidate to 11 tools (breaking change)

This is where the breaking change lives. Do it last among the
functionality phases so that if anything in phase 2 breaks, the diff
is small.

Touched files:

- `src/tools/file.ts` (new; replaces `read.ts`, `write.ts`,
  `edit.ts`, `list_dir.ts` — but the four old files are kept on
  disk re-exporting from `file.ts` to make the diff minimal and
  reversible).
- `src/tools/wiki.ts`, `wiki_ingest.ts` — already take
  `action`; their public function signature stays
  `wikiTool(args)` and the dispatch in `src/index.ts` becomes a
  single `case "wiki":` matching the consolidated name.
- `src/tools/rag.ts`, `planner.ts`, `compact.ts`,
  `anythingllm.ts` — same pattern.
- `src/tools/exec.ts` and a new `src/tools/exec_job.ts`:
  - `exec` keeps `action="run" | "background"` and the two
    binaries (`execTool`, `execPollTool`, etc.).
  - `exec_job` becomes a single entry with
    `action="poll" | "kill" | "list" | "clean"`.
- `src/index.ts` — fully rewrite the tool list to **only** the 11
  consolidated names. Drop the granular alias mapping (the old block
  at lines 339–372 of `src/index.ts`).
- Update the README to list the 11 names with one-line
  descriptions.

Names exposed (final list, for the executor to transcribe into
`src/index.ts`):

| Name | Action values |
|---|---|
| `file` | `read` \| `write` \| `edit` \| `list` |
| `exec` | `run` \| `background` |
| `exec_job` | `poll` \| `kill` \| `list` \| `clean` |
| `web_search` | — (no action) |
| `wiki` | `search` \| `read` \| `write` \| `list` |
| `wiki_ingest` | `ingest` \| `query` \| `lint` \| `update_index` \| `update_log` |
| `rag` | `search` \| `add` \| `list` \| `delete` \| `collections` \| `ingest_sessions` |
| `planner` | `create` \| `read` \| `list` \| `update` \| `delete` \| `next` \| `status` |
| `compact` | `memory` \| `status` \| `list` |
| `anythingllm` | `list` \| `export` \| `export-all` |
| `notify` | — (no action) |

That's 11 names — `file`, `exec`, `exec_job`, `web_search`, `wiki`,
`wiki_ingest`, `rag`, `planner`, `compact`, `anythingllm`,
`notify`. Final tally:

| # | Tool | Has `action` |
|---|---|---|
| 1 | `file` | yes |
| 2 | `exec` | yes |
| 3 | `exec_job` | yes |
| 4 | `web_search` | no |
| 5 | `wiki` | yes |
| 6 | `wiki_ingest` | yes |
| 7 | `rag` | yes |
| 8 | `planner` | yes |
| 9 | `compact` | yes |
| 10 | `anythingllm` | yes |
| 11 | `notify` | no |

Action parameter contract: every entry that takes `action` declares
the enum in `inputSchema.properties.action.enum`. Tools without
`action` (`web_search`, `notify`) omit the property entirely.

Granular-tool callers (anyone still using `wiki_search`,
`planner_create`, etc.) get the JSON-RPC error
`-32602 Unknown tool: wiki_search`. Documented in the README breaking
changes section.

**Exit criteria**:
- `npm run check` passes.
- Diff `tmp/baseline-tools-list.json` against the new list: name set
  is `{file, exec, exec_job, web_search, wiki, wiki_ingest, rag,
  planner, compact, anythingllm, notify}` and nothing else.
- Each `inputSchema.properties.action` has a `type: "string"` and an
  `enum` array matching the values above.
- Description for each new tool fits on one line and is < 120 chars.

### Phase 4 — Path and category policies

Touched files:

- `src/utils/sandbox.ts` (new) — exports
  `resolveAllowedPath(input: string): string | { error: string }`.
- `src/index.ts` — call `resolveAllowedPath` for every
  `path`, `workspace`, `arg` argument that goes to a file or wiki
  tool. (No change to the dispatch, only to the entry point.)
- `README.md`, `docs/env-vars.md` — document two new env vars:

  | Env var | Default | Behaviour |
  |---|---|---|
  | `AURA_ALLOWED_PATHS` | empty | Colon- (POSIX) or semicolon- (Windows) separated list of extra absolute paths the sandbox permits. Used as an opt-in trust list for scripts that need to reach, e.g., a project folder outside `AGENT_WORKSPACE`. |
  | `AURA_ENABLED_CATEGORIES` | `file,exec,exec_job,web_search,wiki,wiki_ingest,rag,planner,compact,anythingllm,notify` | Comma-separated whitelist of category names. Tools in disabled categories are filtered out of the `tools/list` response. Runtime reload not required (re-spawn the server to update). |

The category filter is applied **once at boot** in `main()`. No
mid-session toggling; document this.

**Exit criteria**:
- Manually try `wiki(action="read", path="../../etc/passwd")`:
  result is `isError: true` with a readable message.
- Manually try with `AURA_ALLOWED_PATHS="/tmp"` set and
  `wiki(action="read", path="/tmp/x.md")`: succeeds.
- Setting `AURA_ENABLED_CATEGORIES=file,planner` makes
  `tools/list` return only those two entries.

### Phase 5 — Command deny-list for exec

Touched files:

- `src/tools/exec-safety.ts` (new). Exports
  `checkCommandSafety(command: string): { ok: true } | { ok: false, reason: string }`.
  Patterns (per `agent-tools-native.md` line 270–271, READ-ONLY):

  ```ts
  const DANGEROUS_PATTERNS: { name: string; regex: RegExp }[] = [
    { name: "rm -rf /",     regex: /\brm\s+(-[rRfF]+\s+)*\/(?:\s|$)/ },
    { name: "format C:",    regex: /\bformat\s+([A-Z]:|\/dev\/)/i },
    { name: "del recursive root", regex: /\bdel\s+(\/f|\/s|\/q).*?[A-Z]:\\/i },
    { name: "mkfs on existing mount", regex: /\bmkfs(\.\w+)?\s+\/dev\// },
    { name: "dd writing to device", regex: /\bdd\s+.*\bof=\/dev\// },
  ];
  ```

- `src/tools/exec.ts` — run `checkCommandSafety` before any spawn.
  On failure, return `{ isError: true, content: [{ type: "text",
  text: "Refused: <name> pattern would risk catastrophic damage." }] }`.

- `README.md` — note the deny-list and tell users to disable it
  with `AURA_DISABLE_EXEC_DENYLIST=1` only if they really know
  what they are doing.

**Exit criteria**:
- `node -e 'require("./dist/tools/exec-tool")'` against `rm -rf /`
  returns the refusal message.
- `node -e ...` against `ls -la` succeeds normally.
- README documents `AURA_DISABLE_EXEC_DENYLIST`.

### Phase 6 — `outputSchema` and `structuredContent`

Touched files:

- `src/index.ts` — for each of `web_search`, `rag`,
  `planner` (only `action: status`), `exec_job` (only `action:
  poll`), `wiki` (only `action: list`), `compact` (only `action:
  status`):
  - declare an `outputSchema` (a JSON Schema describing the shape of
    the structured payload);
  - populate `result.structuredContent` with the same data;
  - populate `result.content[0].text` with the
    human-readable string (existing).

  Example shape for `web_search`:
  ```ts
  outputSchema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url:   { type: "string" },
            snippet: { type: "string" }
          },
          required: ["title", "url", "snippet"]
        }
      },
      engine: { type: "string", enum: ["duckduckgo", "brave"] }
    },
    required: ["results", "engine"]
  }
  ```

  The corresponding `structuredContent` is built next to the
  textual `formatResults(...)` from
  `src/tools/webSearch.ts:158–172`.

For all other tools, do not add `outputSchema` (the shape isn't
stable or not useful enough to validate).

**Exit criteria**:
- `tools/list` response for `web_search` contains a non-empty
  `outputSchema`.
- A test invocation returns both `content[0].text` (the human
  string) and `structuredContent.results` (the typed array).
- Any MCP client that does not understand `outputSchema` still
  works because `content[0].text` is still populated.

### Phase 7 — Documentation updates

Touched files:

- `README.md` — rewrite the "Tools" section to list the 11 tools;
  add a "Breaking changes from v2.x" subsection; add the two new
  env vars to the existing table; add a "Context budget" callout
  pointing at the 11-tool ceiling; add a "Disable the exec
  deny-list" subsection pointing at `AURA_DISABLE_EXEC_DENYLIST`.
- `TOOLS.md` — same content but more concise.
- `docs/setup.md` (currently empty/replaced) — restore a fresh
  "Installing v3.0" section: `git clone`,
  `npm ci`, `npm run build`, edit
  `anythingllm_mcp_servers.json` or `~/.lmstudio/mcp.json`.
- `docs/env-vars.md` — extend with `AURA_ALLOWED_PATHS`,
  `AURA_ENABLED_CATEGORIES`, `AURA_DISABLE_EXEC_DENYLIST`.
- `docs/wiki.md` — refresh to reflect the new `wiki(action)`
  surface and the truncation behaviour.
- `docs/compaction.md` — refresh for `compact(action)` and the
  `[INSTRUCTION: …]` prefix on results.
- `docs/planner.md` — refresh for `planner(action)`.
- `docs/architecture.md` — refresh the diagram to show 11 tools,
  one per file, with action enums shown.

Move nothing else into `docs/Old/`. Anything currently in
`docs/Old/` stays there as the archive of v2.1.0 design.

**Exit criteria**:
- README renders correctly with no broken links.
- Each `docs/*.md` file references only the v3.0 names.
- `docs/Old/` is unchanged.

### Phase 8 — Build, version, tag

1. `npm run check` — passes.
2. `npm run build` — produces `dist/index.js`.
3. Bump version:
   - `package.json`: `"version": "3.0.0"`.
   - `package-lock.json`: same.
4. Diff the new `tools/list` against the baseline
   `tmp/baseline-tools-list.json`. Print a short summary like:

   ```
   Tools before: 36
   Tools after:  11
   Removed:      wiki_search, wiki_read, ..., planner_create, ...
   Added:        file (read|write|edit|list), exec_job (poll|kill|...)
   ```

5. Manual end-to-end test against a mock client:
   - boot the server with `AGENT_WORKSPACE=./workspace`;
   - call each of the 11 tools with each action verb;
   - verify the output is well-formed (`content[0].text` starts
     with `[INSTRUCTION: …]` where applicable, returns
     `isError: true` on bad input, etc.);
   - spot-check the deny-list with a synthetic dangerous command.
6. Manual end-to-end against a real client if one is available:
   - LM Studio 0.3.17+: add via `~/.lmstudio/mcp.json`,
     observe the 11 tools in the Program tab, run a chat that
     triggers one of each.
   - AnythingLLM Desktop ≥ 1.8: add via
     `plugins/anythingllm_mcp_servers.json`, open Agent Skills,
     verify the 11 tools and run a chat that triggers one of each.

If only one host is available, the other one is checked the next
time. Both hosts accept stdio + node — same artefact works for both.

7. Report: append an entry to `docs/RELEASE_NOTES.md` (new file
   if it does not yet exist) summarising v3.0 changes for end
   users.

**Exit criteria**:
- `npm run check` and `npm run build` both green.
- `node dist/index.js` answers `initialize`, `tools/list`,
  `tools/call` on all 11 tools.
- The breaking-change list is published in the README.

---

## 4. Disallowed moves

For the executor's sanity check, these are **never to be done**:

1. Modify anything under `W:\SviluppoProgetti\AuraWrite\`.
2. Open, copy, or even `cat` files outside the listed read scope.
3. Add new dependencies beyond what's already in `package.json`
   without flagging it back to the human first. The current
   dependencies (`@modelcontextprotocol/sdk`) cover everything
   in scope.
4. Introduce tools from AuraWrite that aren't in the v2.1.0 server
   already (no `editor_edit`, `chat_search`, `download_image`,
   `get_document_images`, `save_image_base64`, `wiki_stats`,
   `plan_stats`, `rag_stats`, `chat_stats`, `*_reset_all`).
5. Touch `docs/Old/`. Files there are frozen v2.1.0 reference.
6. Promote v3.0 to a feature branch without an explicit
   "ready to publish" approval from the human. This plan ends
   with a working tree; publishing is a separate decision.
7. Use SSE/HTTP transport. StdIO only.
8. Switch RAG from ChromaDB to sqlite-vec. That is a v3.x
   separate piece of work.

## 5. Order summary

```
0. Baseline capture
1. Truncate helper + compact descriptions         (no API change)
2. [INSTRUCTION: …] + truncation in every tool    (no API change)
3. Consolidate to 11 tools with action enums      (BREAKING)
4. Sandbox + enabled-categories filtering         (no API change)
5. Exec command deny-list                          (no API change)
6. outputSchema + structuredContent                (additive, optional)
7. Refresh README/TOOLS.md/docs/                   (docs only)
8. Build, smoke-test, version bump                  (release prep)
```

If a phase is blocked, halt and ask. Do not cascade a phase 2 issue
into a phase 3 rewrite.

## 6. Success criteria for v3.0

- `tools/list` returns exactly 11 entries; each entry has an
  `inputSchema` with an `action` enum where applicable.
- No result string contains content over its tool-specific limit
  without an `[... truncated: N chars]` annotation.
- Every multi-line result starts with `[INSTRUCTION: …]` (and
  is short enough to fit in a single short message).
- `outputSchema` is present on `web_search`, `rag`,
  `planner` (status only), `exec_job` (poll only),
  `wiki` (list only), `compact` (status only).
- The deny-list refuses `rm -rf /`, `format`, and the catastrophic
  variants.
- `AURA_ALLOWED_PATHS` lets the sandbox accept paths outside
  `AGENT_WORKSPACE`.
- `AURA_ENABLED_CATEGORIES` filters the tool list at boot.
- `README.md`, `TOOLS.md`, `docs/env-vars.md`, and the four
  feature docs (`wiki.md`, `compaction.md`, `planner.md`,
  `architecture.md`) describe the new surface.
- `package.json` reports `3.0.0`.
- `dist/index.js` builds and runs end-to-end against a mock MCP
  client.
- **`W:\SviluppoProgetti\AuraWrite\` is byte-for-byte unchanged.**
