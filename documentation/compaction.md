# Memory & Session Compaction (v3.6)

`compact` bounds long-term notes (`MEMORY.md`) and, **LM Studio only**, compacts a chat
session into a fresh, smaller chat file.

## Actions

| Action | Args | Behaviour |
|---|---|---|
| `memory` | optional `threshold` (default `300`) | If `MEMORY.md` has more than `threshold` lines, the body from the first `## Notes?` heading onward is appended to `memory-archive.md`, and `MEMORY.md` is rewritten with the preserved head plus a `## Note` pointer. Below threshold, no-op. |
| `session` | `title` (required); optional `contextLength`, `model`, `keepExchanges` | **LM Studio only.** Finds the chat whose internal `name` matches `title`, and writes a NEW chat file: `systemPrompt` = original + a structured summary of the whole conversation, `messages` = first exchange (first user message + its assistant reply) + last `keepExchanges` exchanges (default 2) verbatim. If the estimated size exceeds 50% of the context window, the tail is first reduced to 1 exchange; only if it still exceeds the budget, it keeps the summary only. The original file is never modified. Also writes a portable seed `.md` in `compacted-sessions/`. |
| `status` | — | Returns sizes and a "compaction recommended" flag for `MEMORY.md` plus compacted-sessions count. |
| `list` | — | Lists already-compacted session files in `compacted-sessions/`. |

### compact(action=session) — details

1. **Input**: the chat `title`. Called from inside the chat to compact, the agent passes
   the visible title; the tool searches the LM Studio conversations directory.
2. **Location**: `LM_STUDIO_CONVERSATIONS_DIR` if set, else
   `~/.cache/lm-studio/conversations` (LM Studio 0.4+), else `~/.lmstudio/conversations`.
3. **Context window**: read from the chat file (`lastUsedModel.instanceLoadTimeConfig`
   → `llm.load.contextLength`), or `contextLength` argument, or
   `AURA_COMPACT_CONTEXT_LENGTH`, default `8192`. "Over budget" = estimated tokens > 50% of it.
4. **Summary**: generated with the local model (OpenAI-compatible) at
   `AURA_LLM_URL` (default `http://localhost:1234/v1/chat/completions`) using
   `AURA_LLM_MODEL` (fallback: the chat's `lastUsedModel`). Long transcripts are
   summarized in chunks (map-reduce).
5. **Output**: a new `<timestamp>.conversation.json` in the same folder (LM Studio
   treats it as a new chat, name = `<title> -compacted`); the seed is also saved as
   `compacted-sessions/<name>-<date>.seed.md`. The original is left untouched.

## Token estimation

Token counts are an approximation (chars/4), acceptable because the summary is the
fallback that absorbs imprecision.

## See also

- [planner.md](planner.md) for long-running plans that need persistent checkpoints.
- [architecture.md](architecture.md) for the memory/workspace split.
