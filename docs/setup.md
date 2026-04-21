# Setup Guide

## Requirements

- Node.js 18 or later
- LM Studio 0.3 or later

## Installation

```bash
# Clone or copy the project
cd lm-studio-agent-server
npm install
npm run build
```

## Configuration

### 1. Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_WORKSPACE` | Agent's working directory | Current directory |
| `BRAVE_API_KEY` | Brave Search API key (optional) | None |

### 2. LM Studio MCP Config

Add to `~/.lmstudio/mcp.json` (Linux/macOS) or `%USERPROFILE%\.lmstudio\mcp.json` (Windows):

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

When LM Studio loads the agent, the model reads `SOUL.md` and asks the user for a name, language, and what they want to do.

## Updating

```bash
cd lm-studio-agent-server
git pull  # or copy new files
npm install
npm run build
```
