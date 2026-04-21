# LM Studio Agent Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [LM Studio](https://lmstudio.ai) that gives your local LLM agent a persistent personality, memory, wiki, planner, and session compaction.

## Features

| Feature | Description |
|---------|-------------|
| **Personality** | `SOUL.md` defines the agent's core identity. The agent asks the user for a name on first boot. |
| **Memory** | `MEMORY.md` for session notes with automatic compaction when it grows too large. |
| **User Profile** | `USER.md` for user preferences and facts, filled in over time. |
| **Wiki** | Full [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) system for persistent structured knowledge. |
| **Planner** | Phased project plans with user questions and step-by-step execution. |
| **Session Compaction** | Compact long sessions, preserve key data, start fresh. |
| **Cross-Platform** | Works on Windows, Linux, and macOS. |
| **Built-in Tools** | `exec`, `read`, `write`, `web_search`, `wiki`, `planner`, `compact`. |

## Requirements

- **Node.js** 18 or later
- **LM Studio** 0.3 or later (with MCP support)

## Quick Start

### 1. Install

```bash
git clone https://github.com/yourusername/lm-studio-agent-server.git
cd lm-studio-agent-server
npm install
```

### 2. Configure LM Studio

Add to LM Studio's MCP config file:

**Linux/macOS:** `~/.lmstudio/mcp.json`
**Windows:** `%USERPROFILE%\.lmstudio\mcp.json`

```json
{
  "mcpServers": {
    "agent-server": {
      "command": "node",
      "args": ["/path/to/lm-studio-agent-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "/path/to/lm-studio-agent-server"
      }
    }
  }
}
```

**Windows example:**
```json
{
  "mcpServers": {
    "agent-server": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\YourName\\lm-studio-agent-server\\dist\\index.js"],
      "env": {
        "AGENT_WORKSPACE": "C:\\Users\\YourName\\lm-studio-agent-server"
      }
    }
  }
}
```

### 3. First Boot

When LM Studio loads the agent, the model reads `SOUL.md` and asks:
1. "What name would you like to give me?"
2. "What language do you prefer?"
3. "What would you like to do?"

The agent writes the chosen name into `SOUL.md` and `MEMORY.md`.

## Project Structure

```
lm-studio-agent-server/
├── SOUL.md              # Agent personality & first-boot protocol
├── USER.md              # User profile (filled in over time)
├── MEMORY.md            # Working memory (compact when >300 lines)
├── COMPACT.md           # Session compaction protocol
├── PLANNER.md           # Planner protocol
├── BORN.md              # First boot instructions for the LLM
├── TOOLS.md             # Available tools reference
├── piano-llm-wiki.md    # Wiki architecture documentation
├── src/                 # TypeScript source
│   ├── index.ts         # MCP server entry point
│   ├── tools/           # Tool implementations
│   │   ├── exec.ts      # Shell commands
│   │   ├── read.ts      # File reading
│   │   ├── write.ts     # File writing
│   │   ├── webSearch.ts # Web search (DuckDuckGo/Brave)
│   │   ├── wiki.ts      # Wiki management
│   │   ├── planner.ts   # Plan creation and execution
│   │   └── compact.ts   # Session compaction
│   └── utils/           # Utilities
├── wiki-template/       # Empty wiki structure for new agents
├── docs/                # Documentation
│   ├── setup.md
│   ├── first-boot.md
│   ├── architecture.md
│   ├── wiki.md
│   ├── planner.md
│   ├── compaction.md
│   └── env-vars.md
├── package.json
├── tsconfig.json
└── LICENSE
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `exec` | Execute shell commands with timeout, working directory, and background support. |
| `read` | Read text files or images (jpg, png, gif, webp). Supports offset and limit. |
| `write` | Write files, creating parent directories automatically. |
| `web_search` | Search the web via DuckDuckGo (free) or Brave API (optional key). |
| `wiki` | Manage the local LLM wiki: search, read, write, list. |
| `planner` | Create and manage phased plans: create, read, list, update, delete, next. |
| `compact` | Check status or compact the session memory. |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENT_WORKSPACE` | No | `.` | Agent working directory. All file operations are scoped here. |
| `BRAVE_API_KEY` | No | — | Brave Search API key. Enables Brave search engine. |

## Wiki System

The LLM Wiki follows the [Karpathy pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) for persistent structured knowledge.

```
wiki/
├── index.md           # Catalog of all pages
├── log.md             # Append-only chronological log
├── summaries/         # One page per source
├── concepts/          # Concepts and frameworks
├── entities/          # People, tools, organizations
├── syntheses/         # Cross-cutting analysis
└── presentations/     # Marp slides (optional)
```

### Operations

- **Ingest** — Process raw sources into summaries, concepts, and entities.
- **Query** — Search the wiki and synthesize answers with citations.
- **Lint** — Health check for orphans, contradictions, broken links.

## Planner

Create structured, phased plans that the agent executes step by step.

```markdown
---
title: "Setup Dev Environment"
created: 2026-04-21
status: active
---

# Plan: Setup Dev Environment

## Objective
Install Node.js, Git, and VS Code.

## Phases

### Phase 1: Node.js
- [x] Check current version
- [ ] Install Node 20 LTS
- [ ] Verify installation

### Phase 2: Git
- [ ] Install Git
- [ ] Configure user.name and user.email
- [ ] Question for user: Which Git hosting service do you use?
  - Option A: GitHub
  - Option B: GitLab
```

**Commands:**
- `planner create` — Start a new plan.
- `planner read` — Display current plan.
- `planner list` — List all plans.
- `planner next` — Execute next step or answer blocking question.

## Session Compaction

When `MEMORY.md` exceeds ~300 lines, compact the session:

1. Review session and identify key decisions, insights, facts.
2. Summarize into a compact paragraph (max 200 words).
3. Preserve critical details in wiki or `MEMORY.md`.
4. Archive to `memory-archive.md`.
5. Start a new session with the summary as initial context.

**Commands:**
- `compact status` — Check if compaction is needed.
- `compact compact` — Execute compaction now.

## Security

- All file paths are resolved relative to `AGENT_WORKSPACE`.
- Paths outside the workspace are rejected.
- Shell commands run with the user's permissions.
- The agent never modifies files outside its workspace without explicit user permission.

## Customization

Edit `SOUL.md` before first boot to customize the agent's personality. The agent will adapt to the user's preferences over time.

## Documentation

- [Setup Guide](docs/setup.md)
- [First Boot](docs/first-boot.md)
- [Architecture](docs/architecture.md)
- [Wiki System](docs/wiki.md)
- [Planner](docs/planner.md)
- [Session Compaction](docs/compaction.md)
- [Environment Variables](docs/env-vars.md)

## License

MIT

## Acknowledgments

- Inspired by Andrej Karpathy's [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- Built with the [Model Context Protocol](https://modelcontextprotocol.io)
