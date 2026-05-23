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

// ============================================================
// TOOL ALIASES per AnythingLLM compatibilita' (descrizioni minimali)
// ============================================================
const ALIASES: Tool[] = [
  {
    name: "filesystem-read-text-file",
    description: "Alias for read. Reads a file. Params: path, offset, limit.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        offset: { type: "number", description: "Start line (optional)" },
        limit: { type: "number", description: "Max lines (optional)" },
      },
      required: ["path"],
    },
  },
  {
    name: "filesystem-write-text-file",
    description: "Alias for write. Writes a file. Params: path, content.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        content: { type: "string", description: "Content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "filesystem-edit-text-file",
    description: "Edit a file. Params: path, search/old_string, replace/new_string.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        file_path: { type: "string", description: "Alternative to path" },
        search: { type: "string", description: "Text to find" },
        old_string: { type: "string", description: "Alias search" },
        match: { type: "string", description: "Alias search" },
        oldText: { type: "string", description: "Alias search" },
        replace: { type: "string", description: "Replacement text" },
        new_string: { type: "string", description: "Alias replace" },
        content: { type: "string", description: "Alias replace" },
        newText: { type: "string", description: "Alias replace" },
      },
      required: [],
    },
  },
  {
    name: "filesystem-list-directory",
    description: "List directory contents. Params: path/directory/folder/dir.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
        directory: { type: "string", description: "Alias path" },
        folder: { type: "string", description: "Alias path" },
        dir: { type: "string", description: "Alias path" },
      },
      required: [],
    },
  },
];

// ============================================================
// TOOL SCHEMAS (compatti per preservare contesto LLM)
// ============================================================
const TOOLS: Tool[] = [
  {
    name: "edit",
    description: "Edit an existing file. Params: path, search/old_string, replace/new_string.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        file_path: { type: "string", description: "Alternative to path" },
        search: { type: "string", description: "Text to find" },
        old_string: { type: "string", description: "Alias search" },
        match: { type: "string", description: "Alias search" },
        oldText: { type: "string", description: "Alias search" },
        replace: { type: "string", description: "Replacement text" },
        new_string: { type: "string", description: "Alias replace" },
        content: { type: "string", description: "Alias replace" },
        newText: { type: "string", description: "Alias replace" },
      },
      required: [],
    },
  },
  {
    name: "list_dir",
    description: "List directory contents. Params: path/directory/folder/dir.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
        directory: { type: "string", description: "Alias path" },
        folder: { type: "string", description: "Alias path" },
        dir: { type: "string", description: "Alias path" },
      },
      required: [],
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
        content: { type: "string", description: "Content da scrivere" },
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
  {
    name: "wiki",
    description: "Local wiki. Actions: search, read, write, list. Params: action, query/path/content, maxResults.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "read", "write", "list"], description: "Action to perform" },
        query: { type: "string", description: "Search query (per action=search)" },
        path: { type: "string", description: "Page path, e.g. 'projects/idea.md' (for action=read/write)" },
        content: { type: "string", description: "Content markdown (per action=write)" },
        maxResults: { type: "number", description: "Max number of results (optional, default 10)" },
      },
      required: ["action"],
    },
  },
  {
    name: "rag",
    description: "Semantic search via ChromaDB + Ollama embeddings. Actions: search, add, list, delete, collections, ingest_sessions.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "add", "list", "delete", "collections", "ingest_sessions"], description: "RAG action" },
        collection: { type: "string", description: "Collection name (for action=search/add/list/delete)" },
        query: { type: "string", description: "Search query semantica (per action=search)" },
        id: { type: "string", description: "Document ID (for action=add/delete)" },
        text: { type: "string", description: "Document text (for action=add)" },
        metadata: { type: "string", description: "JSON metadata string (for action=add)" },
        limit: { type: "number", description: "Max results (default 5 for search, 50 for list)" },
        filter: { type: "string", description: "JSON metadata filter (for action=search)" },
        folder: { type: "string", description: "Specific session folder (for action=ingest_sessions)" },
        reindex: { type: "boolean", description: "Re-index everything from scratch (for action=ingest_sessions)" },
      },
      required: ["action"],
    },
  },
  {
    name: "wiki_ingest",
    description: "Advanced Karpathy-style wiki. Actions: ingest, query, lint, update_index, update_log.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["ingest", "query", "lint", "update_index", "update_log"], description: "Azione" },
        source: { type: "string", description: "File path raw (per ingest) o descrizione operazione (per update_log)" },
        query_text: { type: "string", description: "Query text (for action=query)" },
      },
      required: ["action"],
    },
  },
  {
    name: "planner",
    description: "Phased project planner. Actions: create, read, list, update, delete, next, status. Saved in plans/.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "read", "list", "update", "delete", "next", "status"], description: "Azione" },
        name: { type: "string", description: "Plan name" },
        content: { type: "string", description: "Content markdown del piano (per create/update)" },
        answer: { type: "string", description: "Answer to a blocking question (for action=next)" },
      },
      required: ["action"],
    },
  },
  {
    name: "compact",
    description: "Compact memory. Actions: memory(auto), status, list. Default threshold: 300 lines.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["memory", "status", "list"], description: "Azione" },
        threshold: { type: "number", description: "Line threshold for memory compaction (default: 300)" },
      },
      required: ["action"],
    },
  },
  {
    name: "anythingllm",
    description: "Export AnythingLLM chat sessions. Actions: list, export, export-all. API at localhost:3001.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "export", "export-all"], description: "Azione" },
        workspace: { type: "string", description: "Workspace slug (for export)" },
        thread: { type: "string", description: "Thread slug (optional, for export)" },
        apiKey: { type: "string", description: "AnythingLLM API key (optional, uses ANYTHINGLLM_API_KEY env var or api-key.json)" },
      },
      required: ["action"],
    },
  },
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
// FUNZIONE isAnythingLLMForeground (Win32 API via PowerShell EncodedCommand)
// ============================================================
function isAnythingLLMForeground(): boolean {
  if (process.platform !== "win32") return true;
  try {
    const { execSync } = require("child_process");
    // Script passato come EncodedCommand (base64 UTF-16LE) per evitare problemi di escaping
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
    const result = execSync(
      `powershell -NoProfile -EncodedCommand ${encoded}`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"], timeout: 4000 }
    ).trim();

    return result.toLowerCase().includes("anythingllm");
  } catch {
    return true; // in caso di errore, non notificare per sicurezza
  }
}

// Debounce: max 1 notifica ogni 8 secondi
let lastAutoNotifyTime = 0;
// Tool che NON devono generare autoNotify (troppo frequenti o già gestiti)
const SILENT_TOOLS = new Set(["read", "list_dir", "filesystem-read-text-file", "filesystem-list-directory", "notify", "exec_poll", "exec_list", "exec_clean"]);

// ============================================================
// FUNZIONE autoNotify (fire-and-forget, con debounce e filtro tool)
// ============================================================
function autoNotify(name: string, rawResult: any): void {
  // Salta tool silenziosi (troppo frequenti o già gestiti da notifyTool)
  if (SILENT_TOOLS.has(name)) return;

  // Debounce: max 1 notifica ogni 8 secondi (aggiornato subito, sincrono)
  const now = Date.now();
  if (now - lastAutoNotifyTime < 8000) return;
  lastAutoNotifyTime = now;

  void (async () => {
    try {
      if (!isAnythingLLMForeground()) {

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
// SERVER MCP
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

// Handler per listare i tool disponibili
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [...TOOLS, ...ALIASES] };
});

// Handler per eseguire i tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const start = Date.now();

  // Log su file per debug remoto — path assoluto nel workspace
  const logLine = `[${new Date().toISOString()}] CALL ${name} ${JSON.stringify(args)}\n`;
  try {
    const { appendFile } = await import("fs/promises");
    const logPath = process.env.AGENT_WORKSPACE
      ? `${process.env.AGENT_WORKSPACE}/mcp-server.log`
      : "mcp-server.log";
    await appendFile(logPath, logLine);
  } catch { /* ignore */ }

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
      case "wiki":
        result = await wikiTool(args as any);
        break;
      case "rag":
        result = await ragTool(args as any);
        break;
      case "wiki_ingest":
        result = await wikiIngestTool(args as any);
        break;
      case "compact":
        result = await compactTool(args as any);
        break;
      case "planner":
        result = await plannerTool(args as any);
        break;
      case "anythingllm":
        result = await anythingllmTool(args as any);
        break;
      case "notify":
        result = await notifyTool(args as any);
        break;
      case "filesystem-read-text-file":
        result = await readTool(args as any);
        break;
      case "filesystem-write-text-file":
        result = await writeTool(args as any);
        break;
      case "filesystem-edit-text-file":
        result = await editTool(args as any);
        break;
      case "filesystem-list-directory":
        result = await listDirTool(args as any);
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Aura MCP Server v2.0 started on stdio");
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
