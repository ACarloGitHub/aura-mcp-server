# Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENT_WORKSPACE` | No | `.` | Agent working directory. All file operations are scoped here. |
| `BRAVE_API_KEY` | No | — | Brave Search API key. Enables Brave search engine. |

## Setting on Linux/macOS

```bash
export AGENT_WORKSPACE=/path/to/workspace
export BRAVE_API_KEY=your-key-here
```

## Setting on Windows

```powershell
$env:AGENT_WORKSPACE = "C:\path\to\workspace"
$env:BRAVE_API_KEY = "your-key-here"
```

Or set in LM Studio's MCP config `env` section.
