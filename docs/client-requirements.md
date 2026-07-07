# Client requirements: LM Studio, AnythingLLM, MCP spec

What the standalone `aura-mcp-server` v3.0 must satisfy to be a
well-behaved MCP server in the wild, with citations from the actual
host docs and the MCP spec.

> All citations fetched 2026-07-07. Verify the URLs in the next session
> if anything looks stale.

## 1. Model Context Protocol spec (2025-06-18)

Source: `https://modelcontextprotocol.io/docs/concepts/tools`.

### 1.1 Capabilities declaration

A server that supports tools **MUST** declare the capability:

```json
{
  "capabilities": {
    "tools": {
      "listChanged": true
    }
  }
}
```

`listChanged` is optional. Set it to `true` if the v3.0 server ever
emits `notifications/tools/list_changed` (e.g. when
`AURA_ENABLED_CATEGORIES` changes at runtime via SIGHUP, which v3.0
does not need to support). Default to `false`.

### 1.2 Tool descriptor shape

Required fields per tool:

- `name` — unique identifier.
- `description` — human-readable summary of functionality.
- `inputSchema` — JSON Schema describing the input parameters.

Optional but recommended:

- `title` — human-readable display name.
- `outputSchema` — JSON Schema describing the **output**. The spec
  says "tools that provide a structured output schema MUST return
  results that conform to it" and "clients SHOULD validate structured
  results against this schema".
- `annotations` — metadata describing audience/priority/etc.

### 1.3 Tool result shape

Two flavours of content in the same response:

- `content` — array of content items, the default. Always populated
  even if the tool also sends `structuredContent`. Each item has a
  `type` (currently `"text"`, `"image"`, `"audio"`, `"resource_link"`,
  `"resource"`).
- `structuredContent` — typed object returned alongside
  `content`. Spec: "For backwards compatibility, a tool that returns
  structured content SHOULD also return the serialized JSON in a
  TextContent block." (i.e. keep both).

For errors, set `isError: true` on the result object. Use JSON-RPC
errors only for protocol-level issues (unknown tool, bad
method/params/handler, internal). Application-level errors (missing
file, timeout, network blip) go in the result with `isError: true`.

### 1.4 Security considerations from the spec

The spec lists, for clients:

- SHOULD prompt for user confirmation on sensitive operations;
- SHOULD show tool inputs to the user before calling the server;
- SHOULD validate tool results before passing to the LLM;
- SHOULD implement timeouts for tool calls;
- SHOULD log tool usage for audit purposes.

`aura-mcp-server` already implements several of these (timeout,
logging). It does not need to be the one prompting, but it should make
the inputs echo-friendly by returning the parameters used (already the
case via the prefix/instruction pattern).

---

## 2. LM Studio 0.3.17 (and later)

Sources:
- `https://lmstudio.ai/docs/app/mcp`
- `https://lmstudio.ai/blog/lmstudio-v0.3.17`

### 2.1 Configuration file

LM Studio stores its MCP config at:

- macOS/Linux: `~/.lmstudio/mcp.json`
- Windows: `%USERPROFILE%\.lmstudio\mcp.json`

Notation: "Cursor's `mcp.json`" — i.e. `mcpServers: { name: { ... } }`.
A `aura-mcp-server` entry looks like:

```json
{
  "mcpServers": {
    "aura-mcp-server": {
      "command": "node",
      "args": ["W:/SviluppoProgetti/aura-mcp-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "W:/SviluppoProgetti/aura-mcp-server/workspace"
      }
    }
  }
}
```

LM Studio spawns one process per server on demand. The process must
remain alive and expose a stdio MCP server while LM Studio needs it.
v3.0 keeps the current `StdioServerTransport` setup unchanged.

### 2.2 Built-in confirmation dialog

Per the blog post: "When a model calls a tool, LM Studio will show a
confirmation dialog to the user. This allows you to review the tool
call arguments before executing it, including editing the arguments if
needed. You can choose to always allow a given tool or allow it only
once."

Implication for v3.0:
- Tool arguments must be **human-friendly**: enum-like action names
  (already in the design), no blobs of JSON.
- Errors must be **readable**: pure error messages, not stack traces
  on the user's screen. v3.0 keeps `formatError`-style ergonomics.
- Confirmation rules ("always allow for a tool") are managed by LM
  Studio, not the server. The server cannot rely on this; any
  dangerous operation must additionally enforce its own deny-list.

### 2.3 Token-budget warning (critical)

LM Studio docs warn explicitly:

> "Some MCP servers were designed to be used with Claude, ChatGPT,
> Gemini and might use excessive amounts of tokens. Watch out for
> this. It may quickly bog down your local model and trigger frequent
> context overflows."

For a local model with a 4k–32k context window, the cost of a chat
turn with v2.1.0's 36-tool surface is **the entire tool list in
every system prompt**. This is exactly the failure mode AuraWrite
fixed by consolidating 43→14. v3.0 must keep the tool count under 20
(11 is the target) and must keep every descriptor compact.

### 2.4 Path handling

Quoted from the blog:
> "since the MCP Server is running on your host machine you can use
> any path on your host machine that would normally function in a
> command line."

The server is responsible for sandboxing. Keep
`AGENT_WORKSPACE` enforcement. v3.0 adds an `AURA_ALLOWED_PATHS` env
var to opt-in extra directories, but does not introduce a per-call
permission dialog (LM Studio's own confirmation covers per-call; the
server covers persistent policy).

### 2.5 Lifecycle gotcha

> "When you save the mcp.json file, LM Studio will automatically load
> the MCP servers defined in it."

The server must therefore be cold-startable and respond to
`initialize`/`tools/list`/`tools/call` quickly. v3.0 already meets
this; no special init work is required beyond the existing stdio
transport setup.

---

## 3. AnythingLLM Desktop (v1.8.0+)

Sources:
- `https://docs.anythingllm.com/mcp-compatibility/overview`
- `https://docs.anythingllm.com/mcp-compatibility/desktop`

### 3.1 Configuration file

Path: `<storage>/plugins/anythingllm_mcp_servers.json`. The file
format is the same as the standard MCP server spec — AnythingLLM
follows `https://github.com/modelcontextprotocol/servers`.

Example for `aura-mcp-server`:

```json
{
  "mcpServers": {
    "aura-mcp-server": {
      "command": "node",
      "args": ["W:/SviluppoProgetti/aura-mcp-server/dist/index.js"],
      "env": {
        "AGENT_WORKSPACE": "W:/SviluppoProgetti/aura-mcp-server/workspace"
      }
    }
  }
}
```

### 3.2 Supported capabilities

> "We **do not** support Resources, Prompts, or Sampling."

v3.0 must keep its scope to **Tools only**. No attempts to expose
`resources/list`, `prompts/list`, or `sampling/createMessage`.

### 3.3 Startup behaviour

> "AnythingLLM does not automatically start MCP servers when the
> application starts to prevent any overloading of resources on boot
> or unexpected resource consumption. AnythingLLM **will**
> automatically start MCP servers when you open the 'Agent Skills'
> page in the AnythingLLM UI **or** invoke the @agent directive."

Implication: v3.0's first call to `tools/list` or `tools/call` after
spawn must succeed fast. The `tools/list` response in v2.1.0 already
builds the array statically; v3.0 stays static.

### 3.4 `autoStart` override (only honoured here)

AnythingLLM-specific extension:

```json
{
  "mcpServers": {
    "face-generator": {
      "command": "npx",
      "args": ["@dasheck0/face-generator"],
      "anythingllm": { "autoStart": false }
    }
  }
}
```

Document this in the README but do not change server behaviour.
The server has no way to honour it from inside the process — it is
the loader that checks it.

### 3.5 Context budget (critical for local models)

AnythingLLM user docs say:

> "your issue is probably the model you are using - this is
> especially true if you are using a small local model with a limited
> context window."

Same lesson as LM Studio §2.3: keep descriptors small. The 11-tool
target is the right ceiling for a server that wants to work on
4-bit quantised 7–13B models.

### 3.6 Tool persistence caveat

> "the tools downloaded for MCP are stored on your host machine and
> will persist across application restarts and even application
> uninstalls. MCP tools are stored outside of AnythingLLM and you
> should delete them manually if you want to remove them."

Not a server-side issue. Note it in the README troubleshooting
section.

---

## 4. Synthesis: what v3.0 must guarantee

1. **≤ 20 tool descriptors** — hard ceiling; v3.0 ships **11**
   (`file`, `exec`, `exec_job`, `web_search`, `wiki`, `wiki_ingest`,
   `rag`, `planner`, `compact`, `anythingllm`, `notify`).
2. **Descriptions under ~120 chars each** — to fit in the budget of
   small local models.
3. **Per-result body limit** — never return a result larger than 32 KB
   without truncating; anything bigger blows the conversation. v3.0
   tighter limits: web_fetch 5 KB, file_read 10 KB, wiki_read 4 KB,
   rag chunk snippet 500 bytes, web/wiki snippet 300 bytes, exec
   output 200 KB (existing).
4. **No Resources/Prompts/Sampling** — anythingllm and most clients
   only support Tools.
5. **Stdio transport only** for v3.0. AnythingLLM and LM Studio
   both default to it; SSE/HTTP requires certificates and CORS that
   are out of scope for an "alpha" project.
6. **`outputSchema` on stable-shape tools** (optional, but cheap and
   useful when the client honours it).
7. **`structuredContent` mirrored in `content` text** — for backwards
   compat with both AnythingLLM and LM Studio agent loops that read
   `content[0].text`.
8. **`isError: true` for application errors** — both clients surface
   the `content` text as the user-facing error.
9. **No new dependencies** for `outputSchema`/`structuredContent` — the
   @modelcontextprotocol/sdk already in `package.json` v2.1.0 supports
   the 2025-06-18 spec; check the SDK version in phase 3.
10. **Sandbox + opt-in extra paths** — keep `AGENT_WORKSPACE`,
    add `AURA_ALLOWED_PATHS`.
11. **Command deny-list** — independent of the host's confirmation
    dialog.

---

## 5. Things out of scope for v3.0

- SSE/HTTP transport (AnythingLLM and LM Studio work fine with stdio
  and the user only runs this locally).
- WebAuth/OAuth flow (no remote MCP servers).
- Multi-tenant auth (no accounts, no per-workspace tokens).
- Sampling (LM Studio does not advertise it yet; anythingllm does not
  support it).
- Resource templates / prompt templates (AnythingLLM explicitly does
  not support them).

These can be re-evaluated in a future major version once the host
ecosystem converges.
