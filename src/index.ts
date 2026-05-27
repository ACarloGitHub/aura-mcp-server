#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { execTool, execPollTool, execKillTool, execListTool, execCleanTool } from "./tools/exec.js";
import { readTool } from "./tools/read.js";
import { writeTool } from "./tools/write.js";
import { editTool } from "./tools/edit.js";
import { listDirTool } from "./tools/list_dir.js";
import { webSearchTool } from "./tools/webSearch.js";
import { wikiTool } from "./tools/wiki.js";
import { ragTool } from "./tools/rag.js";
import { wikiIngestTool } from "./tools/wiki_ingest.js";
import { plannerTool } from "./tools/planner.js";
import { compactTool } from "./tools/compact.js";
import { anythingllmTool } from "./tools/anythingllm.js";
import { sendWinRTToast } from "./tools/notify.js";
import { notifyTool } from "./tools/notify.js";
import { appendLogWithRotation } from "./utils/helpers.js";

// ============================================================
// No aliases exposed. tools/list contains only canonical names.
// ============================================================

// ============================================================
// TOOL SCHEMAS (compact to preserve LLM context)
// ============================================================
const TOOLS: Tool[] = [
  {
    name: "edit",
    description: "Edit an existing file by replacing `search` with `replace` (first occurrence).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        search: { type: "string", description: "Exact text to find" },
        replace: { type: "string", description: "Replacement text" },
      },
      required: ["path", "search", "replace"],
    },
  },
  {
    name: "list_dir",
    description: "List contents of a directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
      },
      required: ["path"],
    },
  },
  {
    name: "exec",
    description: "Run a shell command. Params: command, timeout(360s), workdir, env, background. Output max 200KB.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to run" },
        workdir: { type: "string", description: "Working directory (optional)" },
        timeout: { type: "number", description: "Timeout in seconds (default 360, max 7200)" },
        background: { type: "boolean", description: "Run in background (optional). Returns sessionId immediately." },
        env: { type: "object", description: "Additional environment variables (optional)" },
      },
      required: ["command"],
    },
  },
  {
    name: "exec_poll",
    description: "Poll output of a background exec job. Params: jobId (sessionId), tail (default 100).",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "The sessionId returned by exec with background:true" },
        tail: { type: "number", description: "Last N lines to return (default 100)" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "exec_kill",
    description: "Kill a background exec job. Params: jobId (sessionId).",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "The sessionId of the job to terminate" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "exec_list",
    description: "List all background jobs (running and completed) with status and age.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "exec_clean",
    description: "Clean up completed background job files. Params: maxAgeHours (default 24), all (boolean, remove all).",
    inputSchema: {
      type: "object",
      properties: {
        maxAgeHours: { type: "number", description: "Delete completed jobs older than N hours (default 24)" },
        all: { type: "boolean", description: "If true, delete all completed jobs regardless of age" },
      },
      required: [],
    },
  },
  {
    name: "read",
    description: "Read a file. Params: path, offset, limit. Images supported. Files >10MB rejected.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of the file to read" },
        offset: { type: "number", description: "Start line for text files (1-based, optional)" },
        limit: { type: "number", description: "Maximum number of lines for text files (optional)" },
      },
      required: ["path"],
    },
  },
  {
    name: "write",
    description: "Write a file. Params: path, content. Creates directories automatically. Max 5MB.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of the file to write" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "web_search",
    description: "Web search. Params: query, count(5), engine(duckduckgo/brave). Timeout 30s.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        count: { type: "number", description: "Number of results (1-10, default 5)" },
        engine: { type: "string", enum: ["duckduckgo", "brave"], description: "Search engine" },
      },
      required: ["query"],
    },
  },
  { name: "wiki_search", description: "Search text across local wiki pages.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Text to search for" }, maxResults: { type: "number", description: "Max results (default 10)" } }, required: ["query"] } },
  { name: "wiki_read", description: "Read a local wiki page.", inputSchema: { type: "object", properties: { path: { type: "string", description: "Page path, e.g. 'projects/idea.md'" } }, required: ["path"] } },
  { name: "wiki_write", description: "Create or overwrite a local wiki page.", inputSchema: { type: "object", properties: { path: { type: "string", description: "Page path" }, content: { type: "string", description: "Markdown content" } }, required: ["path", "content"] } },
  { name: "wiki_list", description: "List all local wiki pages.", inputSchema: { type: "object", properties: { maxResults: { type: "number", description: "Max results (optional)" } }, required: [] } },
  { name: "rag_search", description: "Semantic search inside a ChromaDB collection.", inputSchema: { type: "object", properties: { collection: { type: "string", description: "Collection name" }, query: { type: "string", description: "Semantic query" }, limit: { type: "number", description: "Max results (default 5)" }, filter: { type: "string", description: "JSON metadata filter (optional)" } }, required: ["collection", "query"] } },
  { name: "rag_add", description: "Add a document to a RAG collection.", inputSchema: { type: "object", properties: { collection: { type: "string", description: "Collection name" }, id: { type: "string", description: "Unique document ID" }, text: { type: "string", description: "Document text" }, metadata: { type: "string", description: "JSON metadata string (optional)" } }, required: ["collection", "id", "text"] } },
  { name: "rag_list", description: "List documents inside a RAG collection.", inputSchema: { type: "object", properties: { collection: { type: "string", description: "Collection name" }, limit: { type: "number", description: "Max results (default 50)" } }, required: ["collection"] } },
  { name: "rag_delete", description: "Delete a document from a RAG collection.", inputSchema: { type: "object", properties: { collection: { type: "string", description: "Collection name" }, id: { type: "string", description: "Document ID to delete" } }, required: ["collection", "id"] } },
  { name: "rag_collections", description: "List all available ChromaDB collections.", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "rag_ingest_sessions", description: "Index AnythingLLM session exports into a RAG collection.", inputSchema: { type: "object", properties: { folder: { type: "string", description: "Specific session folder (optional)" }, reindex: { type: "boolean", description: "Re-index from scratch" } }, required: [] } },
  { name: "wiki_ingest_raw", description: "Ingest a raw file into the advanced wiki.", inputSchema: { type: "object", properties: { source: { type: "string", description: "Path of the raw file" } }, required: ["source"] } },
  { name: "wiki_ingest_query", description: "Semantic query against the advanced wiki.", inputSchema: { type: "object", properties: { query_text: { type: "string", description: "Query text" } }, required: ["query_text"] } },
  { name: "wiki_ingest_lint", description: "Lint pass over the advanced wiki (integrity check).", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "wiki_ingest_update_index", description: "Rebuild the index of the advanced wiki.", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "wiki_ingest_update_log", description: "Append an entry to the advanced wiki operation log.", inputSchema: { type: "object", properties: { source: { type: "string", description: "Operation description" } }, required: ["source"] } },
  { name: "planner_create", description: "Create a new plan stored in plans/.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Plan name" }, content: { type: "string", description: "Plan markdown content" } }, required: ["name", "content"] } },
  { name: "planner_read", description: "Read an existing plan.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Plan name" } }, required: ["name"] } },
  { name: "planner_list", description: "List all plans.", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "planner_update", description: "Update the content of an existing plan.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Plan name" }, content: { type: "string", description: "New markdown content" } }, required: ["name", "content"] } },
  { name: "planner_delete", description: "Delete a plan.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Plan name" } }, required: ["name"] } },
  { name: "planner_next", description: "Get next blocking step of a plan. Optionally answers an open question.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Plan name" }, answer: { type: "string", description: "Answer to a blocking question (optional)" } }, required: ["name"] } },
  { name: "planner_status", description: "Concise progress status of a plan.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Plan name" } }, required: ["name"] } },
  { name: "compact_memory", description: "Auto-compact memory beyond the line threshold.", inputSchema: { type: "object", properties: { threshold: { type: "number", description: "Line threshold (default 300)" } }, required: [] } },
  { name: "compact_status", description: "Status of memory files (sizes, last compaction).", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "compact_list", description: "List already compacted sessions.", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "anythingllm_list", description: "List AnythingLLM workspaces (requires API at localhost:3001).", inputSchema: { type: "object", properties: { apiKey: { type: "string", description: "API key (optional, uses ANYTHINGLLM_API_KEY env var)" } }, required: [] } },
  { name: "anythingllm_export", description: "Export threads of an AnythingLLM workspace.", inputSchema: { type: "object", properties: { workspace: { type: "string", description: "Workspace slug" }, thread: { type: "string", description: "Thread slug (optional)" }, apiKey: { type: "string", description: "API key (optional)" } }, required: ["workspace"] } },
  { name: "anythingllm_export_all", description: "Export all AnythingLLM workspaces.", inputSchema: { type: "object", properties: { apiKey: { type: "string", description: "API key (optional)" } }, required: [] } },
  {
    name: "notify",
    description: "Desktop notification + beep. Params: message, title, sound(boolean, default true).",
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
      { encoding: "utf-8", timeout: 4000 }
    );
    return stdout.trim().toLowerCase().includes("anythingllm");
  } catch {
    return true;
  }
}

// Debounce: max 1 notification every 8 seconds
let lastAutoNotifyTime = 0;
// Tools that should NOT trigger autoNotify (too frequent or already handled)
const SILENT_TOOLS = new Set(["read", "list_dir", "filesystem-read-text-file", "filesystem-list-directory", "notify", "exec_poll", "exec_list", "exec_clean"]);

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

        sendWinRTToast("Aura MCP", body);
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
    name: "aura-mcp-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
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
    let result: any;
    switch (name) {
      case "exec":
        result = await execTool(args as any);
        break;
      case "exec_poll":
        result = await execPollTool(args as any);
        break;
      case "exec_kill":
        result = await execKillTool(args as any);
        break;
      case "exec_list":
        result = await execListTool();
        break;
      case "exec_clean":
        result = await execCleanTool(args as any);
        break;
      case "read":
        result = await readTool(args as any);
        break;
      case "write":
        result = await writeTool(args as any);
        break;
      case "edit":
        result = await editTool(args as any);
        break;
      case "list_dir":
        result = await listDirTool(args as any);
        break;
      case "web_search":
        result = await webSearchTool(args as any);
        break;
      case "wiki_search": result = await wikiTool({ ...(args as any), action: "search" } as any); break;
      case "wiki_read": result = await wikiTool({ ...(args as any), action: "read" } as any); break;
      case "wiki_write": result = await wikiTool({ ...(args as any), action: "write" } as any); break;
      case "wiki_list": result = await wikiTool({ ...(args as any), action: "list" } as any); break;
      case "rag_search": result = await ragTool({ ...(args as any), action: "search" } as any); break;
      case "rag_add": result = await ragTool({ ...(args as any), action: "add" } as any); break;
      case "rag_list": result = await ragTool({ ...(args as any), action: "list" } as any); break;
      case "rag_delete": result = await ragTool({ ...(args as any), action: "delete" } as any); break;
      case "rag_collections": result = await ragTool({ ...(args as any), action: "collections" } as any); break;
      case "rag_ingest_sessions": result = await ragTool({ ...(args as any), action: "ingest_sessions" } as any); break;
      case "wiki_ingest_raw": result = await wikiIngestTool({ ...(args as any), action: "ingest" } as any); break;
      case "wiki_ingest_query": result = await wikiIngestTool({ ...(args as any), action: "query" } as any); break;
      case "wiki_ingest_lint": result = await wikiIngestTool({ ...(args as any), action: "lint" } as any); break;
      case "wiki_ingest_update_index": result = await wikiIngestTool({ ...(args as any), action: "update_index" } as any); break;
      case "wiki_ingest_update_log": result = await wikiIngestTool({ ...(args as any), action: "update_log" } as any); break;
      case "compact_memory": result = await compactTool({ ...(args as any), action: "memory" } as any); break;
      case "compact_status": result = await compactTool({ ...(args as any), action: "status" } as any); break;
      case "compact_list": result = await compactTool({ ...(args as any), action: "list" } as any); break;
      case "planner_create": result = await plannerTool({ ...(args as any), action: "create" } as any); break;
      case "planner_read": result = await plannerTool({ ...(args as any), action: "read" } as any); break;
      case "planner_list": result = await plannerTool({ ...(args as any), action: "list" } as any); break;
      case "planner_update": result = await plannerTool({ ...(args as any), action: "update" } as any); break;
      case "planner_delete": result = await plannerTool({ ...(args as any), action: "delete" } as any); break;
      case "planner_next": result = await plannerTool({ ...(args as any), action: "next" } as any); break;
      case "planner_status": result = await plannerTool({ ...(args as any), action: "status" } as any); break;
      case "anythingllm_list": result = await anythingllmTool({ ...(args as any), action: "list" } as any); break;
      case "anythingllm_export": result = await anythingllmTool({ ...(args as any), action: "export" } as any); break;
      case "anythingllm_export_all": result = await anythingllmTool({ ...(args as any), action: "export-all" } as any); break;
      case "notify":
        result = await notifyTool(args as any);
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
      .then(() => execCleanTool({ all: true } as any))
      .catch(() => undefined)
      .finally(() => {
        setTimeout(() => process.exit(0), 200);
      });
  };
  process.stdin.on("end", () => cleanupAndExit("stdin end"));
  process.stdin.on("close", () => cleanupAndExit("stdin close"));
  process.on("SIGTERM", () => cleanupAndExit("SIGTERM"));
  process.on("SIGINT", () => cleanupAndExit("SIGINT"));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Aura MCP Server v2.0 started on stdio");
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
