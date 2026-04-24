# Architecture

```
LM Studio Agent Server
├── MCP Protocol (stdio)
├── Tools
│   ├── exec      — Shell commands
│   ├── read      — File reading
│   ├── write     — File writing
│   ├── web_search — Web search (DuckDuckGo/Brave)
│   ├── wiki      — Wiki management
│   ├── planner   — Plan creation and execution
│   └── compact   — Session compaction
└── Files
    ├── SOUL.md         — Agent personality
    ├── USER.md         — User profile
    ├── MEMORY.md       — Working memory
    ├── COMPACT.md      — Compaction protocol
    ├── PLANNER.md      — Planner protocol
    ├── BORN.md         — First boot protocol
    ├── TOOLS.md        — Tool reference
    ├── llm-wiki-plan.md — Wiki architecture
    └── wiki/           — Knowledge base
```

## Security

- All file paths are resolved relative to `AGENT_WORKSPACE`.
- Paths outside the workspace are rejected.
- Shell commands run with the user's permissions.
