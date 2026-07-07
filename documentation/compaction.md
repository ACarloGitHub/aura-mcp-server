# Memory Compaction (v3.0)

`MEMORY.md` is the agent's working memory: a free-form markdown file in the workspace root. It grows as the agent works. Once it crosses 300 lines, manually or automatically compacting keeps the agent's prompt short.

## Files

- `MEMORY.md` — current working memory.
- `memory-archive.md` — append-only log of past compacted bodies.

The threshold and the compacted-sessions folder name are configurable.

## Actions

The `compact` tool exposes three actions:

| Action | Args | Behaviour |
|---|---|---|
| `memory` | optional `threshold` (default `300`) | If `MEMORY.md` has more than `threshold` lines, the body from the first `## Notes?` heading onward is appended to `memory-archive.md`, and `MEMORY.md` is rewritten with the preserved head plus a `## Note` pointer. Below threshold, no-op (returns a small "Compaction not needed" notice). |
| `status` | — | Returns sizes and a "compaction recommended" flag. `structuredContent` carries `{ memory: {path, lines, threshold, compactionRecommended}, archive: {path, exists, sizeKB}, compactedSessions: {path, count} }`. |
| `list` | — | Lists already-compacted session files in `compacted-sessions/`. |

## Truncation behaviour

All three actions return text wrapped with `[INSTRUCTION: ...]`. For `compact(memory)` the instruction reminds the model to confirm the result. For `compact(status)` it asks the model to summarise concisely and surface the "compaction recommended" hint if present. For `compact(list)` it asks for a brief listing.

## When to compact

Two patterns from the field:

1. **Manual, on demand.** The model calls `compact(action=status)` when it feels the conversation has been long; if `compactionRecommended=true`, it calls `compact(action=memory)` itself.
2. **Scheduled.** `autoNotify` and the agent's own judgement decide; nothing in the server triggers compaction autonomously.

The action is intentionally cheap and idempotent. Calling `compact(memory)` below threshold is a no-op that returns a status message — no harm done.

## See also

- [planner.md](planner.md) for long-running plans that need persistent checkpoints.
- [architecture.md](architecture.md) for the memory/workspace split.
