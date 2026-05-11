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
    description: "Alias read. Legge file. Params: path, offset, limit.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Percorso file" },
        offset: { type: "number", description: "Linea inizio (opzionale)" },
        limit: { type: "number", description: "Max linee (opzionale)" },
      },
      required: ["path"],
    },
  },
  {
    name: "filesystem-write-text-file",
    description: "Alias write. Scrive file. Params: path, content.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Percorso file" },
        content: { type: "string", description: "Contenuto" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "filesystem-edit-text-file",
    description: "Modifica file. Params: path, search/old_string, replace/new_string.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Percorso file" },
        file_path: { type: "string", description: "Alternativa a path" },
        search: { type: "string", description: "Testo da trovare" },
        old_string: { type: "string", description: "Alias search" },
        match: { type: "string", description: "Alias search" },
        oldText: { type: "string", description: "Alias search" },
        replace: { type: "string", description: "Testo sostitutivo" },
        new_string: { type: "string", description: "Alias replace" },
        content: { type: "string", description: "Alias replace" },
        newText: { type: "string", description: "Alias replace" },
      },
      required: [],
    },
  },
  {
    name: "filesystem-list-directory",
    description: "Elenca directory. Params: path/directory/folder/dir.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Percorso directory" },
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
    description: "Modifica file esistente. Params: path, search/old_string, replace/new_string.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Percorso file" },
        file_path: { type: "string", description: "Alternativa a path" },
        search: { type: "string", description: "Testo da trovare" },
        old_string: { type: "string", description: "Alias search" },
        match: { type: "string", description: "Alias search" },
        oldText: { type: "string", description: "Alias search" },
        replace: { type: "string", description: "Testo sostitutivo" },
        new_string: { type: "string", description: "Alias replace" },
        content: { type: "string", description: "Alias replace" },
        newText: { type: "string", description: "Alias replace" },
      },
      required: [],
    },
  },
  {
    name: "list_dir",
    description: "Elenca directory. Params: path/directory/folder/dir.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Percorso directory" },
        directory: { type: "string", description: "Alias path" },
        folder: { type: "string", description: "Alias path" },
        dir: { type: "string", description: "Alias path" },
      },
      required: [],
    },
  },
  {
    name: "exec",
    description: "Shell exec. Params: command, timeout(360s), workdir, env, background. Output max 200KB.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Comando da eseguire" },
        workdir: { type: "string", description: "Directory di lavoro (opzionale)" },
        timeout: { type: "number", description: "Timeout in secondi (default 360, max 7200)" },
        background: { type: "boolean", description: "Esegui in background (opzionale). Restituisce subito il sessionId." },
        env: { type: "object", description: "Variabili d'ambiente aggiuntive (opzionale)" },
      },
      required: ["command"],
    },
  },
  {
    name: "exec_poll",
    description: "Legge output di un exec in background. Params: jobId (sessionId), tail (default 100).",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "Il sessionId restituito da exec con background:true" },
        tail: { type: "number", description: "Ultime N righe da restituire (default 100)" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "exec_kill",
    description: "Termina un exec in background. Params: jobId (sessionId).",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "Il sessionId del job da terminare" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "exec_list",
    description: "Elenca tutti i job background (running e completati) con stato e età.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "exec_clean",
    description: "Pulisce i file dei job background completati. Params: maxAgeHours (default 24), all (boolean, elimina tutto).",
    inputSchema: {
      type: "object",
      properties: {
        maxAgeHours: { type: "number", description: "Elimina job completati più vecchi di N ore (default 24)" },
        all: { type: "boolean", description: "Se true, elimina tutti i job completati indipendentemente dall'età" },
      },
      required: [],
    },
  },
  {
    name: "read",
    description: "Legge file. Params: path, offset, limit. Immagini OK. File >10MB rifiutati.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Percorso del file da leggere" },
        offset: { type: "number", description: "Linea di inizio per file di testo (1-based, opzionale)" },
        limit: { type: "number", description: "Numero massimo di linee per file di testo (opzionale)" },
      },
      required: ["path"],
    },
  },
  {
    name: "write",
    description: "Scrive file. Params: path, content. Crea dirs automaticamente. Max 5MB.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Percorso del file da scrivere" },
        content: { type: "string", description: "Contenuto da scrivere" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "web_search",
    description: "Ricerca web. Params: query, count(5), engine(duckduckgo/brave). Timeout 30s.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Query di ricerca" },
        count: { type: "number", description: "Numero di risultati (1-10, default 5)" },
        engine: { type: "string", enum: ["duckduckgo", "brave"], description: "Motore di ricerca" },
      },
      required: ["query"],
    },
  },
  {
    name: "wiki",
    description: "Wiki locale. Azioni: search, read, write, list. Params: action, query/path/content, maxResults.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "read", "write", "list"], description: "Azione da eseguire" },
        query: { type: "string", description: "Query di ricerca (per action=search)" },
        path: { type: "string", description: "Percorso pagina, es: 'progetti/idea.md' (per action=read/write)" },
        content: { type: "string", description: "Contenuto markdown (per action=write)" },
        maxResults: { type: "number", description: "Numero max risultati (opzionale, default 10)" },
      },
      required: ["action"],
    },
  },
  {
    name: "rag",
    description: "Ricerca semantica ChromaDB. Azioni: search, add, list, delete, collections, ingest_sessions.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "add", "list", "delete", "collections", "ingest_sessions"], description: "Azione RAG" },
        collection: { type: "string", description: "Nome collection (per action=search/add/list/delete)" },
        query: { type: "string", description: "Query di ricerca semantica (per action=search)" },
        id: { type: "string", description: "ID documento (per action=add/delete)" },
        text: { type: "string", description: "Testo documento (per action=add)" },
        metadata: { type: "string", description: "Metadati JSON string (per action=add)" },
        limit: { type: "number", description: "Numero max risultati (default 5 per search, 50 per list)" },
        filter: { type: "string", description: "Filtro JSON per metadata (per action=search)" },
        folder: { type: "string", description: "Cartella sessioni specifica (per action=ingest_sessions)" },
        reindex: { type: "boolean", description: "Re-indicizza tutto da capo (per action=ingest_sessions)" },
      },
      required: ["action"],
    },
  },
  {
    name: "wiki_ingest",
    description: "Wiki avanzata Karpathy. Azioni: ingest, query, lint, update_index, update_log.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["ingest", "query", "lint", "update_index", "update_log"], description: "Azione" },
        source: { type: "string", description: "Percorso file raw (per ingest) o descrizione operazione (per update_log)" },
        query_text: { type: "string", description: "Testo query (per action=query)" },
      },
      required: ["action"],
    },
  },
  {
    name: "planner",
    description: "Piani in fasi. Azioni: create, read, list, update, delete, next, status. Salvati in plans/.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "read", "list", "update", "delete", "next", "status"], description: "Azione" },
        name: { type: "string", description: "Nome del piano" },
        content: { type: "string", description: "Contenuto markdown del piano (per create/update)" },
        answer: { type: "string", description: "Risposta a domanda bloccante (per action=next)" },
      },
      required: ["action"],
    },
  },
  {
    name: "compact",
    description: "Compatta memoria. Azioni: memory(auto), status, list. Soglia default 300 righe.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["memory", "status", "list"], description: "Azione" },
        threshold: { type: "number", description: "Soglia righe per memory compaction (default: 300)" },
      },
      required: ["action"],
    },
  },
  {
    name: "anythingllm",
    description: "Esporta chat AnythingLLM. Azioni: list, export, export-all. API localhost:3001.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "export", "export-all"], description: "Azione" },
        workspace: { type: "string", description: "Slug del workspace (per export)" },
        thread: { type: "string", description: "Slug del thread (opzionale, per export)" },
        apiKey: { type: "string", description: "API key AnythingLLM (opzionale, usa env ANYTHINGLLM_API_KEY o quella di default)" },
      },
      required: ["action"],
    },
  },
  {
    name: "notify",
    description: "Notifica desktop + beep sonoro. Params: message, title, sound(boolean, default true).",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Messaggio della notifica" },
        title: { type: "string", description: "Titolo della notifica (opzionale)" },
        sound: { type: "boolean", description: "Emetti beep sonoro (default true)" },
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

        let body = `Tool "${name}" completato`;
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
        throw new Error(`Tool sconosciuto: ${name}`);
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
      content: [{ type: "text", text: `Errore: ${msg}` }],
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
  console.error("LM Studio MCP Server v2.0 avviato su stdio");
}

main().catch((error) => {
  console.error("Errore fatale avvio server:", error);
  process.exit(1);
});
turn result;
  } catch (error) {
    const elapsed = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[MCP ERROR] ${name} FAILED after ${elapsed}ms: ${msg}`);
    return {
      content: [{ type: "text", text: `Errore: ${msg}` }],
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
  console.error("LM Studio MCP Server v2.0 avviato su stdio");
}

main().catch((error) => {
  console.error("Errore fatale avvio server:", error);
  process.exit(1);
});
