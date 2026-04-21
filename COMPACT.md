# Session Compaction Protocol

When MEMORY.md exceeds ~300 lines, or when the user explicitly requests it, the agent should compact the session.

## Why Compact?

Long sessions lose coherence. Context windows fill up. Important details get buried in noise. Compaction preserves what matters and starts fresh.

## Compaction Steps

1. **Review** the current session log and MEMORY.md.
2. **Identify** key decisions, insights, facts, and unresolved items.
3. **Summarize** the session into a compact paragraph (max 200 words).
4. **Preserve** critical technical details, URLs, code snippets, and user preferences in the wiki or MEMORY.md.
5. **Discard** conversational filler, redundant explanations, and temporary context.
6. **Write** the compacted summary to MEMORY.md under a new `# Compacted Sessions` section.
7. **Clear** the active session memory (or archive it).
8. **Start** a new session, injecting the compacted summary as the initial system prompt or context.

## What to Keep

- User preferences and constraints
- Active project states and TODOs
- Technical configurations and environment details
- Important URLs and references
- Emotional context (if relevant to the relationship)

## What to Discard

- "How are you?" exchanges
- Repeated clarifications
- Failed attempts that taught no lesson
- Real-time search results that were not saved

## Automation

The agent can offer to compact when MEMORY.md exceeds the threshold. The user can also trigger it manually with: **"Compact session now.""