#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { execTool } from "./tools/exec.js";
import { fileTool } from "./tools/file.js";
import { execJobTool } from "./tools/exec_job.js";
import { webSearchTool } from "./tools/webSearch.js";
import { wikiTool } from "./tools/wiki.js";
import { ragTool } from "./tools/rag.js";
import { wikiIngestTool } from "./tools/wiki_ingest.js";
import { plannerTool } from "./tools/planner.js";
import { compactTool } from "./tools/compact.js";
import { anythingllmChatExporterTool } from "./tools/anythingllm.js";
import { sendWinRTToast, notifyTool } from "./tools/notify.js";
import { permissionsTool } from "./tools/permissions.js";
import { appendLogWithRotation } from "./utils/helpers.js";
import { resolveAllowedPaths, enabledCategories } from "./utils/permissions.js";
import { stopEmbeddingServer, registerShutdownHook } from "./rag/llamaserver.js";

// ============================================================
// No aliases exposed. tools/list contains only canonical names.
// ============================================================

// ============================================================
// TOOL SCHEMAS (compact to preserve LLM context; 11 tools, v3.0)
// ============================================================
let TOOLS: Tool[] = [
  {
    name: "file",
    description: "Read, write, edit, or list a file in the workspace. Use for: any filesystem operation.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "write", "edit", "list"], description: "Which file action to perform" },
        path: { type: "string", description: "File or directory path (required for read/write/edit, optional for list)" },
        content: { type: "string", description: "File content (action=write)" },
        search: { type: "string", description: "Exact text to find (action=edit)" },
        replace: { type: "string", description: "Replacement text (action=edit)" },
        offset: { type: "number", description: "Start line for text reads (action=read, 1-based, optional)" },
        limit: { type: "number", description: "Maximum number of lines for text reads (action=read, optional)" },
      },
      required: ["action"],
    },
  },
  {
    name: "exec",
    description: "Run a shell command. Use for: any host action the agent needs.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["run", "background"], description: "run waits for completion; background returns a sessionId" },
        command: { type: "string", description: "Command to run" },
        workdir: { type: "string", description: "Working directory (optional)" },
        timeout: { type: "number", description: "Timeout in seconds (default 360, max 7200)" },
        env: { type: "object", description: "Additional environment variables (optional)" },
      },
      required: ["action", "command"],
    },
  },
  {
    name: "exec_job",
    description: "Manage a background exec job. Use for: polling, killing, listing, cleaning jobs.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["poll", "kill", "list", "clean"], description: "Job management action" },
        jobId: { type: "string", description: "sessionId of the job (required for poll and kill)" },
        tail: { type: "number", description: "Last N lines to return (action=poll, default 100)" },
        maxAgeHours: { type: "number", description: "Delete completed jobs older than N hours (action=clean, default 24)" },
        all: { type: "boolean", description: "Delete all completed jobs regardless of age (action=clean)" },
      },
      required: ["action"],
    },
  },
  {
    name: "web_search",
    description: "Web search via DuckDuckGo. Use for: external info.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        count: { type: "number", description: "Number of results (1-10, default 5)" },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        engine: { type: "string", enum: ["duckduckgo"] },
        query: { type: "string" },
        count: { type: "number" },
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              snippet: { type: "string" },
            },
            required: ["title", "url", "snippet"],
          },
        },
      },
      required: ["engine", "query", "count", "results"],
    },
  },
  {
    name: "wiki",
    description: "Manage the local wiki. Use for: notes and knowledge pages.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "read", "write", "list"], description: "Which wiki action to perform" },
        query: { type: "string", description: "Text to search for (action=search)" },
        path: { type: "string", description: "Page path (action=read/write, e.g. 'projects/idea.md')" },
        content: { type: "string", description: "Markdown content (action=write)" },
        maxResults: { type: "number", description: "Max results (action=search/list, default 10)" },
      },
      required: ["action"],
    },
  },
  {
    name: "wiki_ingest",
    description: "Curate the structured wiki: ingest raw files, fix the curated wiki into the RAG, query the index, lint integrity, update index and log.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["ingest", "ingest_wiki", "query", "lint", "update_index", "update_log"], description: "ingest: load raw file from Wiki/raw/ and return content with instructions. ingest_wiki: index the curated wiki pages into the RAG 'wiki' collection (upsert by path; excludes raw/, test/, ritest/, index.md, log.md). query: surface index for a query. lint: check frontmatter, orphans, confidence. update_index: rebuild Wiki/wiki/index.md. update_log: append to Wiki/wiki/log.md." },
        source: { type: "string", description: "Path under Wiki/raw/ (action=ingest) or operation description (action=update_log)" },
        query_text: { type: "string", description: "Query text (action=query)" },
      },
      required: ["action"],
    },
  },
  {
    name: "rag",
    description: "Semantic search and document management over a native sqlite-vec index. Use for: context by meaning. Chat capture is per client: ingest_sessions is LM Studio only (reads .conversation.json from disk); ingest_anythingllm is AnythingLLM only (reads chats via the AnythingLLM API).",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "add", "list", "delete", "collections", "ingest_sessions", "ingest_anythingllm", "ingest_status"], description: "Which RAG action to perform" },
        collection: { type: "string", description: "Collection name (search/add/list/delete)" },
        query: { type: "string", description: "Semantic query (action=search)" },
        id: { type: "string", description: "Document ID (action=add/delete)" },
        text: { type: "string", description: "Document text (action=add)" },
        metadata: { type: "string", description: "JSON metadata string (action=add, optional)" },
        limit: { type: "number", description: "Max results (action=search default 5, list default 50)" },
        filter: { type: "string", description: "JSON metadata filter (action=search, optional)" },
        folder: { type: "string", description: "Specific LM Studio session folder (action=ingest_sessions, optional)" },
        reindex: { type: "boolean", description: "Re-index from scratch (action=ingest_sessions)" },
        workspace: { type: "string", description: "AnythingLLM workspace slug (action=ingest_anythingllm, optional; default all)" },
        thread: { type: "string", description: "AnythingLLM thread slug (action=ingest_anythingllm, optional)" },
        jobId: { type: "string", description: "Ingest job id returned by ingest_sessions/ingest_anythingllm (action=ingest_status, required)" },
      },
      required: ["action"],
    },
  },
  {
    name: "planner",
    description: "Create, read, update, delete, advance or query phased plans. Use for: structured multi-step work.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "read", "list", "update", "delete", "next", "status"], description: "Which planner action to perform" },
        name: { type: "string", description: "Plan name (create/read/update/delete/next/status)" },
        content: { type: "string", description: "Plan markdown content (create/update)" },
        answer: { type: "string", description: "Answer to a blocking question (action=next, optional)" },
      },
      required: ["action"],
    },
  },
  {
    name: "compact",
    description: "Bound long-term notes and sessions. memory/status/list manage MEMORY.md and compacted-sessions/. session is LM Studio only: compacts an LM Studio chat into a new chat file. It reads the chat's .conversation.json (messages[].versions[].steps[].content[]), extracting the user messages and each assistant's final answer block (excluding the model's reasoning narration, tool-call internals and debug blocks), summarizes them with the local model, and writes a NEW chat file (original untouched).",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["memory", "status", "list", "session"], description: "Which compact action to perform" },
        threshold: { type: "number", description: "Line threshold (action=memory, default 300)" },
        title: { type: "string", description: "Title of the LM Studio chat to compact (action=session, required)" },
        contextLength: { type: "number", description: "Context length in tokens (action=session, optional; otherwise read from the chat file, AURA_COMPACT_CONTEXT_LENGTH, or 8192)" },
        model: { type: "string", description: "Model id for the summary (action=session, optional; default AURA_LLM_MODEL or the chat's lastUsedModel)" },
        keepExchanges: { type: "number", description: "Recent user exchanges kept verbatim (action=session, default 2)" },
      },
      required: ["action"],
    },
  },
  {
    name: "anythingllm_chat_exporter",
    description: "AnythingLLM only: list or export chats from a running AnythingLLM instance via its REST API (default http://localhost:3001/api/v1). Use for: capturing AnythingLLM chat history. On AnythingLLM, call this before rag(action=ingest_anythingllm) to store chats in the RAG.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "export", "export-all"], description: "Which anythingllm_chat_exporter action to perform" },
        workspace: { type: "string", description: "Workspace slug (action=export)" },
        thread: { type: "string", description: "Thread slug (action=export, optional)" },
        apiKey: { type: "string", description: "API key (optional, uses ANYTHINGLLM_API_KEY env var)" },
      },
      required: ["action"],
    },
  },
  {
    name: "notify",
    description: "Desktop notification with optional beep. Use for: alerting the user.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Notification message" },
        title: { type: "string", description: "Notification title (optional)" },
        sound: { type: "boolean", description: "Emit a beep sound (default true)" },
      },
      required: ["message"],
    },
  },
  {
    name: "permissions",
    description: "Manage path permissions for file access. Use for: granting, revoking, or listing allowed paths.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["grant", "revoke", "list", "clear_session"], description: "Which permissions action to perform" },
        path: { type: "string", description: "Path to grant or revoke (required for grant/revoke)" },
        scope: { type: "string", enum: ["session", "always"], description: "Permission scope (action=grant, default session)" },
        tool: { type: "string", description: "Tool name the permission applies to (action=grant, default file)" },
      },
      required: ["action"],
    },
  },
];

// ============================================================
// isAnythingLLMForeground function (Win32 API via PowerShell EncodedCommand)
// ============================================================
import { execFile as _execFile } from "child_process";
import { promisify as _promisify } from "util";
const execFileAsync = _promisify(_execFile);

async function isAnythingLLMForeground(): Promise<boolean> {
  if (process.platform !== "win32") return true;
  try {
    const script = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class WinForeground {',
      '    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);',
      '    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);',
      '}',
      '"@',
      '$hwnd = [WinForeground]::GetForegroundWindow()',
      '$sb = New-Object System.Text.StringBuilder(256)',
      '[WinForeground]::GetWindowText($hwnd, $sb, 256) | Out-Null',
      '$pid = 0',
      '[WinForeground]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null',
      '$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue',
      'Write-Output "$($sb.ToString())|$($proc.ProcessName)"',
    ].join('\n');
    const encoded = Buffer.from(script, "utf-16le").toString("base64");
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-EncodedCommand", encoded],
      { encoding: "utf-8", timeout: 4000, windowsHide: true }
    );
    return stdout.trim().toLowerCase().includes("anythingllm");
  } catch {
    return true;
  }
}

// Debounce: max 1 notification every 8 seconds
let lastAutoNotifyTime = 0;
// Tools that should NOT trigger autoNotify (too frequent or already handled)
const SILENT_TOOLS = new Set(["file", "exec_job", "notify"]);

// ============================================================
// autoNotify function (fire-and-forget, with debounce and tool filter)
// ============================================================
function autoNotify(name: string, rawResult: any): void {
  if (process.env.MCP_DISABLE_AUTONOTIFY === "1") return;
  if (SILENT_TOOLS.has(name)) return;

  const now = Date.now();
  if (now - lastAutoNotifyTime < 8000) return;
  lastAutoNotifyTime = now;

  void (async () => {
    try {
      const isForeground = await isAnythingLLMForeground();
      if (!isForeground) {
        let body = `Tool "${name}" completed`;
        if (rawResult?.content && Array.isArray(rawResult.content) && rawResult.content.length > 0) {
          const firstText = rawResult.content[0]?.text;
          if (typeof firstText === "string" && firstText.length < 80 && firstText.trim().length > 0) {
            body = firstText.trim();
          }
        }

        sendWinRTToast("AuraMCP", body);
      }
    } catch {
      // fire-and-forget: ignore all errors
    }
  })();
}

// ============================================================
// MCP SERVER
// ============================================================
const server = new Server(
  {
    name: "auramcp-server",
    version: "3.5.1",
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: [
      "AuraMCP exposes domain tools with an action parameter.",
      "Chat capture is client-specific:",
      "- LM Studio only: compact(action=session) compacts a chat into a new chat file; rag(action=ingest_sessions) indexes conversations from disk.",
      "- AnythingLLM only: anythingllm_chat_exporter(action=export|export-all) fetches chats via the AnythingLLM API; rag(action=ingest_anythingllm) exports and indexes them into the RAG 'sessions' collection.",
      "On AnythingLLM, to store chats into the RAG, call anythingllm_chat_exporter first, then rag(action=ingest_anythingllm).",
      "wiki_ingest(action=ingest_wiki) fixes the curated wiki pages into the RAG 'wiki' collection (upsert by path; excludes raw/).",
      "RAG is a generic semantic store (collections: sessions, wiki, ...). Use rag(action=search) for recall by meaning.",
    ].join("\n"),
  }
);

// Handler to list available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handler to execute tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const start = Date.now();

  const logLine = `[${new Date().toISOString()}] CALL ${name} ${JSON.stringify(args)}\n`;
  const logPath = process.env.AGENT_WORKSPACE
    ? `${process.env.AGENT_WORKSPACE}/mcp-server.log`
    : "mcp-server.log";
  const maxLogMB = Number(process.env.MCP_LOG_MAX_MB ?? 10);
  await appendLogWithRotation(logPath, logLine, maxLogMB);

  try {
    // Skip path check for tools that don't touch the filesystem
    if (name !== "permissions" && name !== "notify" && name !== "web_search" && name !== "anythingllm_chat_exporter") {
      const pathCheck = resolveAllowedPaths(args as any, [
        "path",
        "file_path",
        "workspace",
        "source",
        "dir",
        "directory",
        "folder",
      ], name);
      if (!pathCheck.ok) {
        const err = pathCheck as any;
        if (err.pendingApproval) {
          return {
            content: [{
              type: "text",
              text: `[INSTRUCTION: Ask the user if they want to allow access to this path. If they agree, use the permissions tool to grant access, then retry this call.]

Permission required: ${err.path}

The path is outside AGENT_WORKSPACE and not in the permission store. Ask the user to approve, then call the permissions tool with action=grant, path=<the path>, scope=session|always. After granting, retry this tool call.`,
            }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: `Permission: ${pathCheck.error}` }],
          isError: true,
        };
      }
    }

    let result: any;
    switch (name) {
      case "file":
        result = await fileTool(args as any);
        break;
      case "exec":
        result = await execTool(args as any);
        break;
      case "exec_job":
        result = await execJobTool(args as any);
        break;
      case "web_search":
        result = await webSearchTool(args as any);
        break;
      case "wiki":
        result = await wikiTool(args as any);
        break;
      case "wiki_ingest":
        result = await wikiIngestTool(args as any);
        break;
      case "rag":
        result = await ragTool(args as any);
        break;
      case "planner":
        result = await plannerTool(args as any);
        break;
      case "compact":
        result = await compactTool(args as any);
        break;
      case "anythingllm_chat_exporter":
        result = await anythingllmChatExporterTool(args as any);
        break;
      case "notify":
        result = await notifyTool(args as any);
        break;
      case "permissions":
        result = await permissionsTool(args as any);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    const elapsed = Date.now() - start;
    if (process.env.MCP_DEBUG) {
      console.error(`[MCP DEBUG] ${name} OK in ${elapsed}ms`);
    }

    autoNotify(name, result);

    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[MCP ERROR] ${name} FAILED after ${elapsed}ms: ${msg}`);
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

// ============================================================
// MAIN
// ============================================================
async function main() {
  process.on("uncaughtException", (err) => {
    console.error("[FATAL uncaughtException]", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[FATAL unhandledRejection]", reason);
  });

  let shuttingDown = false;
  const cleanupAndExit = (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[MCP] shutdown triggered by ${reason}, cleaning background jobs`);
    Promise.resolve()
      .then(() => execJobTool({ action: "clean", all: true } as any))
      .catch(() => undefined)
      .finally(() => {
        stopEmbeddingServer();
        setTimeout(() => process.exit(0), 200);
      });
  };
  process.stdin.on("end", () => cleanupAndExit("stdin end"));
  process.stdin.on("close", () => cleanupAndExit("stdin close"));
  process.on("SIGTERM", () => cleanupAndExit("SIGTERM"));
  process.on("SIGINT", () => cleanupAndExit("SIGINT"));

  registerShutdownHook();

  const enabled = enabledCategories(TOOLS.map((t) => t.name));
  if (enabled !== null) {
    const before = TOOLS.length;
    TOOLS = TOOLS.filter((t) => enabled.has(t.name));
    console.error(`[MCP] AURA_ENABLED_CATEGORIES applied: ${before} -> ${TOOLS.length} tools`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AuraMCP Server v3.1 started on stdio");
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
