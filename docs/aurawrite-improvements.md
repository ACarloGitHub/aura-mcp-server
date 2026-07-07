# Lessons learned from AuraWrite's MCP integration

This document collects the techniques AuraWrite developed while turning its
agent tools from a Node.js MCP child process (the previous incarnation of
`aura-mcp-server`) into native Rust implementations. They are the patterns a
new instance should apply when rewriting `aura-mcp-server` v3.0.

> **Scope.** AuraWrite's MCP panel native tools are documented in
> `W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\AuraWrite-Wiki\concepts\agent-tools-native.md`
> and `W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\AuraWrite-Wiki\concepts\tools-consolidation.md`.
> Those two pages are the canonical reference. Read them entirely before
> designing any new tool surface.

> **Read-only.** AuraWrite files are listed here only as **read references**
> for the next opencode instance. They MUST NOT be modified. This applies to
> everything under `W:\SviluppoProgetti\AuraWrite\` and also includes the
> `aura-mcp-server` mirrors present inside that workspace
> (`W:\SviluppoProgetti\AuraWrite\Cartella_di_Sviluppo\aura-mcp-server` if it
> exists). The new instance operates exclusively inside
> `W:\SviluppoProgetti\aura-mcp-server\`.

---

## 1. Consolidation: collapse similar tools into one with an `action` enum

AuraWrite reduced the tool surface from **43** to **14** by combining
similar functions into a single tool whose first parameter is an `action`
enumeration. Quote from
`AuraWrite-Wiki/concepts/tools-consolidation.md`:

> "Un solo strumento per dominio, con parametro `action` (enumerazione).
> Segue le linee guida OpenAI: combinare funzioni simili, usare enum,
> meno di 20 funzioni per turno."

Concrete collapse map (AuraWrite → after consolidation):

| Domain | Before (granular) | After (consolidated) |
|---|---|---|
| Entities/DB | `search_entities`, `get_entity_details`, `list_entities_by_type`, `entities_in_document`, `semantic_search_entities`, `get_entity_embeddings` | `entity_query(action=…)` |
| Documents | `search_documents`, `get_document_content`, `get_project_structure`, `semantic_search` | `document_query(action=…)` |
| Planner CRUD | `plan_create`, `plan_read`, `plan_update`, `plan_delete`, `plan_list` | `plan_manage(action=…)` |
| Planner progress | `plan_next`, `plan_status` | `plan_progress(action=…)` |
| Web | `web_search`, `web_fetch`, `web_search_images` | `web_query(action=…)` |
| Wiki read | `wiki_search`, `wiki_read`, `wiki_list` | `wiki_query(action=…)` |
| Wiki write | `wiki_write`, `wiki_ingest` | `wiki_write(action=…)` |

The translation to `aura-mcp-server` is direct: each pre-existing
`wiki_*`, `planner_*`, `rag_*`, `compact_*`, `anythingllm_*` already
exports a function with `action` internally; the server already has both
shapes in `tools/list` (granular aliases + consolidated). v3.0 keeps only
the consolidated shape.

### Rules to follow

1. **Never ask the model for state it doesn't already have.** OpenAI
   guidance: "don't make the model fill arguments you already know".
   Example from `tools-consolidation.md`: cursor position and selection
   range are read by the host application at call time, not passed by the
   model. Translated to `aura-mcp-server` v3.0: do not invent
   configuration arguments that the model can't reasonably fill from
   natural-language prompts.
2. **One tool per domain.** Filesystem (read/write/edit/list_dir)
   becomes one tool with `action=`. Same for wiki, planner, rag,
   anythingllm, compact.
3. **Keep the prefix where event routing depends on it.**
   `tools-consolidation.md` notes that `chat.ts` routes UI events on the
   prefix (`plan_`, `wiki_`, `web_`). `aura-mcp-server` does not have an
   internal event bus but AnyTextLM/LM Studio may display the tool name
   to the user, so prefix preservation (e.g. `wiki`, `planner`, `rag`)
   makes the result more readable to humans.
4. **Total tool count under 20.** v2.1.0 exposes 36 tools; v3.0 should
   stay strictly below OpenAI's recommended ceiling. The target is
   **11** (`file`, `exec`, `exec_job`, `web_search`, `wiki`,
   `wiki_ingest`, `rag`, `planner`, `compact`, `anythingllm`,
   `notify`).

### Reference files (read-only)

- `AuraWrite-Wiki/concepts/tools-consolidation.md` (canonical strategy
  doc, read fully).
- `AuraWrite-Wiki/concepts/agent-tools-native.md` (implementation
  reference: lines 139–155 catalogue the consolidated tools and where
  they live in Rust).

---

## 2. Tool Result Injection pattern

Every tool result that may be long or tempting to reproduce verbatim is
prefixed with an inline instruction telling the model how to handle it.
Quote from
`AuraWrite-Wiki/concepts/agent-tools-native.md`:

> "I modelli rispettano molto più le istruzioni inline nel risultato
> rispetto alle regole nel system prompt."

The mechanism: the tool returns a string starting with
`[INSTRUCTION: ...]`. The host application (chat UI, agent loop) strips
the prefix before showing the result as a card, but the model still sees
the instruction embedded in the tool-result turn.

### Concrete examples (Rust source — read-only)

| Tool | File | Instruction prefix |
|---|---|---|
| `web_search` (results found) | `src-tauri/src/web_tools.rs:142` | `[INSTRUCTION: Summarize the most relevant 2-3 results for the user. Do NOT list all results verbatim. Pick the most relevant ones and describe them briefly in your own words.]` |
| `web_search` (no results) | `src-tauri/src/web_tools.rs:138` | `[INSTRUCTION: Tell the user that no results were found and suggest alternative search terms.]` |
| `web_fetch` (full page) | `src-tauri/src/web_tools.rs:321` | `[INSTRUCTION: You have the full content of this page. Use it as needed.]` |
| `web_search_images` | `src-tauri/src/web_tools.rs:400` | `[INSTRUCTION: Describe the most relevant images briefly. Do NOT list all URLs verbatim. Pick 2-3 most relevant and describe them.]` |
| `plan_create` | `src-tauri/src/planner.rs:53` | `[INSTRUCTION: Do NOT repeat the plan content in your response. …]` |
| `plan_read` | `src-tauri/src/planner.rs:65` | `[INSTRUCTION: Do NOT repeat the plan content. Summarize in 1-2 sentences …]` |
| `plan_next` (completed) | `src-tauri/src/planner.rs:125` | `[INSTRUCTION: Do NOT list all tasks. Reply with ONE sentence …]` |
| `plan_next` (answer recorded) | `src-tauri/src/planner.rs:140` | `[INSTRUCTION: Do NOT list all tasks. Reply with ONE sentence.]` |
| `plan_status` | `src-tauri/src/planner.rs:185` | `[INSTRUCTION: Do NOT repeat the plan content or list all tasks. …]` |

### Rules to follow in v3.0

- Use `[INSTRUCTION: ...]` as the first line of every text result of any
  tool that returns more than one line of content.
- The host (anythingllm/lm-studio) does not strip the prefix, so the
  instruction stays in the model's view. The card UI in those clients
  shows the raw text; that is acceptable because the instruction is
  short and useful to the user too.
- Phrase instructions imperatively and address the model directly
  ("Summarize…", "Do NOT…", "Reply with ONE sentence").
- For zero-result paths ("nothing found", "empty list") still emit an
  instruction telling the model what to say back.

---

## 3. Per-type result truncation

AuraWrite trims results before they reach the model. Limits, all taken
from `AuraWrite-Wiki/concepts/agent-tools-native.md` lines 107–113:

| Tool | Field | Limit |
|---|---|---|
| `web_fetch` | full converted content | 5 KB (200 KB max body before conversion) |
| `wiki_read` | body | 4 000 chars + total count |
| `file_read` | text content | 10 000 chars + total count |
| `rag_search` | snippet per chunk | 500 chars |
| `web_search` / `web_search_images` | snippet per item | 300 chars |

`aura-mcp-server` v2.1.0 already has `MAX_OUTPUT_CHARS = 200_000` on the
`exec` tool. v3.0 should introduce per-type limits for every
content-returning tool.

### Concrete impl reference (read-only)

`src-tauri/src/web_tools.rs:87–93` defines
`fn truncate_str(s: &str, max: usize) -> String` returning
`format!("{}...", &s[..max.saturating_sub(3)])` for the over-limit case.
Each tool calls this with its own constant. In `aura-mcp-server` v3.0 the
same helper goes in `src/utils/truncate.ts` with per-tool constants.

---

## 4. Compact tool descriptions

`aura-mcp-server` v2.1.0 has `description` strings like
`"Run a shell command. Params: command, timeout(360s), workdir, env,
background. Output max 200KB."` (file `src/index.ts:60`). AuraWrite
discovered this is wasteful:

1. The actual schema goes in `inputSchema.properties`; restating it in
   the description doubles the tokens.
2. The model fills parameters from the schema, not from natural-language
   hints.

Rule: the description is for **what the tool is for and when to use it**,
not for parameter listings. Examples from
`tools-consolidation.md`:

> `entity_query` description: "Read-only access to project entities.
> Use for: looking up people, places, concepts; enumerating entities of
> a given type; semantic search inside the project." (no parameter list)

For v3.0 rewrite each `description` to a single sentence ending in
"Use for: …".

---

## 5. Granular `result.tool` survives consolidation

In AuraWrite the inner executor returns the **granular** logical name in
`result.tool` even when the consolidated tool (`plan_manage`,
`wiki_query`, …) was called, because the UI listens on prefix-based
events (`plan_*`, `wiki_*`). The dispatch path is therefore:
tool-with-action in, granular-out.

`aura-mcp-server` does not have a UI bus. However, AnythingLLM's agent
skills page lists the tools by name and LM Studio's tool-call
confirmation dialog shows the tool name to the user. **Recommended
behaviour:** keep the `name` in `ListToolsRequestSchema` response as
`wiki`, `planner`, … (the consolidated one, the only one shown) and let
the model see whatever the user sees. This preserves the simpler
contract.

---

## 6. DuckDuckGo Lite parsing (a hard-won bug fix)

Lesson from the porting of the web_search tool from Node.js to Rust
(AuraWrite Rust). Documented in
`AuraWrite-Wiki/concepts/agent-tools-native.md` line 69 and visible in
`src-tauri/src/web_tools.rs:158–235`:

> **Use POST** to `https://lite.duckduckgo.com/lite/` with body
> `q=<query>&kl=us-en` and headers `Referer`,
> `Content-Type: application/x-www-form-urlencoded`, `Accept-Language`,
> browser-like `User-Agent`. **Do NOT use GET**: DDG Lite requires POST.

> **Parser uses single quotes.** The HTML uses `class='result-link'` and
> `class='result-snippet'` with **single quotes**, not double. Several
> regexes in `web_tools.rs:19–33` handle both styles to be safe.

The current `src/tools/webSearch.ts` already gets this right (file
`webSearch.ts:60–115`); no change needed, **but** the new instance must
not regress it. When adapting the parser to a new helper,
copy the multi-regex approach verbatim.

---

## 7. `outputSchema` and `structuredContent` in the MCP descriptors

AuraWrite's Rust tools return JSON-serializable results because the host
is a typed Rust↔TypeScript bridge. The MCP spec 2025-06-18 (see
`https://modelcontextprotocol.io/docs/concepts/tools`) supports both:

- `outputSchema`: JSON Schema describing the *output* of the tool. The
  client validates the response and the model gets a clear contract.
- `structuredContent`: a typed object alongside the human-readable
  `content` text. The spec says tools "SHOULD" also include the
  serialized JSON inside `content` for clients that don't read
  `structuredContent`.

v3.0 should declare `outputSchema` on the tools where the schema is
stable (`web_search`, `rag`, `planner_status`, `exec_poll`, `wiki_list`,
`compact_status`) and mirror the JSON in `content` so both old and new
clients can read it.

---

## 8. Permission system (apply only partially)

AuraWrite has a 3-state permission store (Deny / Allow session / Allow
always) anchored to its own UI dialog (`src-tauri/src/permissions.rs`,
concept page `agent-workspace`).

`aura-mcp-server` has no UI of its own. The host (AnythingLLM/LM Studio)
**already shows a confirmation dialog before every tool call** (see
`docs/client-requirements.md` and the LM Studio blog release notes for
0.3.17). So:

- Do **not** implement a custom dialog/state. AnythingLLM/LM Studio
  cover "per-call confirmation".
- Do add an env var `AURA_ALLOWED_PATHS` listing paths that bypass the
  workspace check (use case: scripts that legitimately need to write
  outside the configured `AGENT_WORKSPACE`).
- Keep the existing `AGENT_WORKSPACE` enforcement: paths outside it
  that are not in `AURA_ALLOWED_PATHS` return
  `isError: true` with a clear message. The client will then surface
  the error in chat, which is the right escalation.

## 9. Hardening shell exec (apply in full)

AuraWrite's exec tool runs `std::process::Command` after checking a
deny-list of catastrophic patterns
(`AuraWrite-Wiki/concepts/agent-tools-native.md` line 270–271):

- `rm -rf /`
- `format` (Windows)
- `del /f /s /q C:\` (Windows)

v3.0 should add the same deny-list in
`src/tools/exec.ts`. Quoting the wiki:

> "lista nera minimale di pattern (rm -rf /, format,
> del /f /s /q C:\) per prevenire distruzioni accidentali."

Patterns must match anywhere in the command string. Each pattern that
hits returns an error result *before* the spawn. The check is
complementary to the host's own confirmation dialog, not a replacement.

## 10. MAX_TOOL_ITERATIONS is client-side, not server-side

`aura-mcp-server` is a stateless tool dispatcher. The limit on how many
tool calls a single agent turn may emit is a property of the *client*
(the agent loop in AnythingLLM / LM Studio). AuraWrite increased
`MAX_TOOL_ITERATIONS` from 3 to 10 (`tools.ts`) for the new tools. The
standalone server does not need a parallel knob; if the host supports
iteration count, it will be set there.

What the server **can** do is minimise per-call cost so the host's
budget stretches further: small descriptions, truncated results, no
verbose logs in the response. Those moves land in v3.0 via phases 1–4
of the implementation plan.

---

## 11. What to bring, what to deliberately leave out

Already present in `aura-mcp-server` v2.1.0 (no porting needed):

- `withTimeout` helper around every external call (existing
  `src/tools/webSearch.ts:43–55`).
- `MAX_OUTPUT_CHARS = 200_000` on exec.
- `formatError`/`textResult` helpers in `src/utils/helpers.ts`.
- Auto-notify with debounce (`src/index.ts:239–272`).
- Logger with rotation (`appendLogWithRotation`).

To port from AuraWrite (full list, with fate):

| Idea | Fate for v3.0 |
|---|---|
| Tool consolidation to one-per-domain with `action` enum | **Port** (the headline change). |
| `[INSTRUCTION: …]` prefix on results | **Port** verbatim for every result-returning tool. |
| Per-type truncation limits | **Port** as new helper `src/utils/truncate.ts`. |
| Compact `description` strings | **Port** while editing each entry in `src/index.ts`. |
| DuckDuckGo Lite POST + single-quote parser | **Keep** (already correct). |
| `outputSchema`/`structuredContent` | **Port** for stable-shape tools. |
| 3-state permission store | **Adapt** as `AURA_ALLOWED_PATHS` env var only. |
| Command deny-list | **Port** as a new module `src/tools/exec-safety.ts`. |
| Workdir confinement in exec | **Already present** (`workdir` arg validation; tighten). |
| Toggle per category | **Replace** by `AURA_ENABLED_CATEGORIES` env var listing active ones (no UI to toggle). |
| `MAX_TOOL_ITERATIONS` | **Out of scope** (client-side). |
| `result.tool` granular pass-through | **Skip** (no event bus in standalone). |

To deliberately leave out of the plan (AuraWrite-specific, not
applicable):

- `editor_edit` (markdown→ProseMirror inside AuraWrite's editor).
- `chat_search` / `chat_stats` / `chat_reset_all` (no chat sessions on
  the standalone server).
- `get_document_images` / `download_image` / `save_image_base64`
  (depends on AuraWrite's document model and assets).
- `wiki_stats` / `wiki_reset_all` / `plan_stats` / `plan_reset_all` /
  `rag_stats` / `rag_reset_all` / `rag_reset_project` (AuraWrite UI
  panel machinery). The standalone `compact` tool already covers
  session housekeeping; no per-AuraWrite-entity-counts equivalent
  exists and should not be invented.
- Anything tied to AuraWrite's SQLite or to ProseMirror.

---

## 12. Quick reference table (file → line)

| AuraWrite file | What it teaches | Section above |
|---|---|---|
| `AuraWrite-Wiki/concepts/tools-consolidation.md` | Strategy: 43→14 with `action` enum | §1 |
| `AuraWrite-Wiki/concepts/agent-tools-native.md` | Implementation-level reference for every consolidated tool; result-injection wording; truncation table; exec deny-list; toggle wiring | §1, §2, §3, §9 |
| `src-tauri/src/web_tools.rs:138,142,321,400` | Sample `[INSTRUCTION: …]` prefixes for web tools | §2 |
| `src-tauri/src/planner.rs:53,65,92,125,140,147,185` | Sample `[INSTRUCTION: …]` prefixes for planner | §2 |
| `src-tauri/src/web_tools.rs:87` | `truncate_str` helper shape | §3 |
| `src-tauri/src/web_search.rs:158–235` | DDG Lite POST + single-quote parser | §6 |
| `src-tauri/src/permissions.rs:1–100` | Permission state machine | §8 (partial) |
| `src-tauri/src/workspace.rs` | Workspace root sandbox (the legacy `AGENT_WORKSPACE` analogue) | §11 |

The two wiki pages are short (<350 lines combined). Read them fully
before starting phase 2 of the implementation.
