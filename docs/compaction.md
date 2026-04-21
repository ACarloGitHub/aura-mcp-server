# Session Compaction

When `MEMORY.md` exceeds ~300 lines, compact the session.

## Why Compact?

- Long sessions lose coherence.
- Context windows fill up.
- Important details get buried.

## How It Works

1. Review session log and `MEMORY.md`.
2. Identify key decisions, insights, facts, unresolved items.
3. Summarize into a compact paragraph (max 200 words).
4. Preserve critical details in wiki or `MEMORY.md`.
5. Discard filler and temporary context.
6. Write summary to `memory-archive.md`.
7. Reset `MEMORY.md` with compacted context.
8. Start a new session with the summary as initial context.

## Commands

- `compact status` — Check if compaction is needed.
- `compact compact` — Execute compaction now.

## What to Keep

- User preferences and constraints.
- Active project states and TODOs.
- Technical configurations.
- Important URLs and references.

## What to Discard

- Greetings and small talk.
- Repeated clarifications.
- Failed attempts with no lesson.
- Unsaved search results.
