import { writeFile, mkdir, readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getWorkspaceRoot, formatError } from "../utils/helpers.js";
import { wrapWithInstruction } from "../utils/resultWrapper.js";
import { ragAdd } from "../rag/index.js";

const WORKSPACE = getWorkspaceRoot();
const SESSIONS_DIR = join(WORKSPACE, "AnythingLLMSessions");
const API_BASE = process.env.ANYTHINGLLM_BASE_URL || "http://localhost:3001/api/v1";

// Resolve the server root directory (where api-key.json should be placed)
// @ts-ignore — import.meta.url valido in ESM Node16
const _serverDir = dirname(dirname(fileURLToPath(import.meta.url)));

export async function getApiKey(argsKey?: string): Promise<string> {
  // 1. Direct parameter in tool call
  if (argsKey) return argsKey;

  // 2. Env var
  if (process.env.ANYTHINGLLM_API_KEY) return process.env.ANYTHINGLLM_API_KEY;

  // 3. File api-key.json nella cartella del server (e.g. auramcp-server/api-key.json)
  //    Cerca prima nella dir del server, poi nel workspace
  const candidates = [
    join(_serverDir, "api-key.json"),
    join(WORKSPACE, "api-key.json"),
  ];
  for (const configPath of candidates) {
    try {
      const raw = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      // Reject both legacy and new placeholder values
      const placeholders = new Set([
        "INSERT-YOUR-ANYTHINGLLM-API-KEY-HERE",
      ]);
      if (parsed.anythingllm_api_key && !placeholders.has(parsed.anythingllm_api_key)) {
        return parsed.anythingllm_api_key;
      }
    } catch {
      // ignore, try next candidate
    }
  }

  throw new Error(
    "AnythingLLM API key not found. " +
    "Set it in api-key.json (server directory) or in the ANYTHINGLLM_API_KEY environment variable."
  );
}

const API_TIMEOUT = 15_000;

interface AnythingLLMArgs {
  action: "list" | "export" | "export-all";
  workspace?: string;
  thread?: string;
  apiKey?: string;
}

interface Workspace {
  id: number;
  name: string;
  slug: string;
  threads: { slug: string; name: string; user_id: number | null }[];
}

interface ChatMessage {
  chatId: number;
  role: string;
  content: string;
  sentAt: number;
  sources?: any[];
  metrics?: any;
  type?: string;
  feedbackScore?: any;
}

export async function anythingllmChatExporterTool(args: AnythingLLMArgs): Promise<any> {
  try {
    const key = await getApiKey(args.apiKey);

    switch (args.action) {
      case "list":
        return await listWorkspaces(key);
      case "export":
        return await exportChats(key, args.workspace, args.thread);
      case "export-all":
        return await exportAll(key);
      default:
        throw new Error(`Unknown anythingllm_chat_exporter action: ${args.action}`);
    }
  } catch (error) {
    return formatError(error);
  }
}

async function withApiTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timeout (${API_TIMEOUT}ms)`)), API_TIMEOUT)
  );
  return Promise.race([promise, timeout]);
}

async function listWorkspaces(apiKey: string): Promise<any> {
  const workspaces = await withApiTimeout(fetchWorkspaces(apiKey), "listWorkspaces");

  if (workspaces.length === 0) {
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          "No workspaces found in AnythingLLM.",
          "Tell the user there are no workspaces to export."
        ),
      }],
    };
  }

  const lines: string[] = ["Available AnythingLLM workspaces:\n"];
  for (const ws of workspaces) {
    lines.push(`  ${ws.name} (slug: ${ws.slug})`);
    if (ws.threads && ws.threads.length > 0) {
      for (const t of ws.threads) {
        lines.push(`    - Thread: "${t.name}" (slug: ${t.slug})`);
      }
    } else {
      lines.push(`    - No threads`);
    }
    lines.push("");
  }

  lines.push(`Total: ${workspaces.length} workspace(s)`);
  lines.push(`\nTo export: action=export workspace="slug" [thread="threadslug"]`);
  lines.push(`To export all: action=export-all`);

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        lines.join("\n"),
        "List the available workspaces; the model can choose which to export next."
      ),
    }],
  };
}

async function exportChats(apiKey: string, workspaceSlug?: string, threadSlug?: string): Promise<any> {
  if (!workspaceSlug) {
    return await listWorkspaces(apiKey);
  }

  const messages = await withApiTimeout(fetchChats(apiKey, workspaceSlug, threadSlug), "exportChats");

  if (messages.length === 0) {
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `No chats found for workspace "${workspaceSlug}"${threadSlug ? ` / thread "${threadSlug}"` : ""}.`,
          "Tell the user there are no chats to export from that workspace/thread."
        ),
      }],
    };
  }

  await mkdir(SESSIONS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().split("T")[0];
  const safeSlug = workspaceSlug.replace(/[^a-zA-Z0-9_-]/g, "_");
  const suffix = threadSlug ? `_thread_${threadSlug.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
  const filename = `${timestamp}_AnythingLLM_${safeSlug}${suffix}.md`;
  const filepath = join(SESSIONS_DIR, filename);

  let md = `---\n`;
  md += `title: "AnythingLLM - ${workspaceSlug}"\n`;
  md += `type: chat-export\n`;
  md += `source: anythingllm\n`;
  md += `workspace: ${workspaceSlug}\n`;
  if (threadSlug) md += `thread: ${threadSlug}\n`;
  md += `exported: ${new Date().toISOString()}\n`;
  md += `messages: ${messages.length}\n`;
  md += `---\n\n`;
  md += `# AnythingLLM — ${workspaceSlug}\n`;
  if (threadSlug) md += `\nThread: ${threadSlug}\n`;
  md += `\nExported on ${new Date().toLocaleDateString("en-US")}\n`;
  md += `Messaggi: ${messages.length}\n\n`;
  md += `---\n\n`;

  for (const msg of messages) {
    const dateStr = msg.sentAt ? new Date(msg.sentAt * 1000).toLocaleString("en-US") : "unknown date";
    const role = msg.role === "user" ? "User" : "Assistant";
    md += `### ${role} — ${dateStr}\n\n`;
    md += `${msg.content}\n\n`;

    if (msg.metrics?.model) {
      md += `> Modello: ${msg.metrics.model} | Provider: ${msg.metrics.provider || "unknown"}\n\n`;
    }
  }

  md += `---\n\n_Exported via AnythingLLM API_`;

  await writeFile(filepath, md, "utf-8");

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Export completed!\n\n- Workspace: ${workspaceSlug}${threadSlug ? ` / Thread: ${threadSlug}` : ""}\n- Messages: ${messages.length}\n- Saved in: AnythingLLMSessions/${filename}`,
        "Acknowledge the export and where the file was saved."
      ),
    }],
  };
}

async function exportAll(apiKey: string): Promise<any> {
  await mkdir(SESSIONS_DIR, { recursive: true });

  const workspaces = await withApiTimeout(fetchWorkspaces(apiKey), "exportAll");
  const results: string[] = [];

  for (const ws of workspaces) {
    const mainMessages = await fetchChats(apiKey, ws.slug);
    if (mainMessages.length > 0) {
      const timestamp = new Date().toISOString().split("T")[0];
      const safeSlug = ws.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `${timestamp}_AnythingLLM_${safeSlug}.md`;
      const filepath = join(SESSIONS_DIR, filename);

      let md = buildFrontmatter(ws.slug, mainMessages.length);
      md += `# AnythingLLM — ${ws.name}\n\nMain workspace chat.\n\n`;
      md += buildChatBody(mainMessages);

      await writeFile(filepath, md, "utf-8");
      results.push(`  ${ws.name}: ${mainMessages.length} msg → ${filename}`);
    }

    if (ws.threads && ws.threads.length > 0) {
      for (const t of ws.threads) {
        const threadMessages = await fetchChats(apiKey, ws.slug, t.slug);
        if (threadMessages.length > 0) {
          const timestamp = new Date().toISOString().split("T")[0];
          const safeSlug = ws.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
          const safeThread = t.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
          const filename = `${timestamp}_AnythingLLM_${safeSlug}_${safeThread}.md`;
          const filepath = join(SESSIONS_DIR, filename);

          let md = buildFrontmatter(ws.slug, threadMessages.length, t.slug);
          md += `# AnythingLLM — ${ws.name}\n\nThread: ${t.name}\n\n`;
          md += buildChatBody(threadMessages);

          await writeFile(filepath, md, "utf-8");
          results.push(`  ${ws.name} / ${t.name}: ${threadMessages.length} msg → ${filename}`);
        }
      }
    }
  }

  if (results.length === 0) {
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          "No chats to export.",
          "Acknowledge that there were no chats to export."
        ),
      }],
    };
  }

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Export complete!\n\n${results.join("\n")}\n\nTotal: ${results.length} files saved in AnythingLLMSessions/`,
        "Acknowledge the bulk export and how many files were saved."
      ),
    }],
  };
}

async function fetchWorkspaces(apiKey: string): Promise<Workspace[]> {
  const res = await fetch(`${API_BASE}/workspaces`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  return data.workspaces || [];
}

async function fetchChats(apiKey: string, workspaceSlug: string, threadSlug?: string): Promise<ChatMessage[]> {
  const url = threadSlug
    ? `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/chats`
    : `${API_BASE}/workspace/${workspaceSlug}/chats`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error (${res.status}) for ${url}: ${err}`);
  }

  const data = (await res.json()) as any;
  return data.history || [];
}

function buildFrontmatter(workspaceSlug: string, msgCount: number, threadSlug?: string): string {
  let md = `---\n`;
  md += `title: "AnythingLLM - ${workspaceSlug}"\n`;
  md += `type: chat-export\n`;
  md += `source: anythingllm\n`;
  md += `workspace: ${workspaceSlug}\n`;
  if (threadSlug) md += `thread: ${threadSlug}\n`;
  md += `exported: ${new Date().toISOString()}\n`;
  md += `messages: ${msgCount}\n`;
  md += `---\n\n`;
  return md;
}

function buildChatBody(messages: ChatMessage[]): string {
  let md = "";
  md += `Exported on ${new Date().toLocaleDateString()}\n`;
  md += `Messages: ${messages.length}\n\n---\n\n`;

  for (const msg of messages) {
    const dateStr = msg.sentAt ? new Date(msg.sentAt * 1000).toLocaleString() : "unknown date";
    const role = msg.role === "user" ? "User" : "Assistant";
    md += `### ${role} — ${dateStr}\n\n`;
    md += `${msg.content}\n\n`;

    if (msg.metrics?.model) {
      md += `> Model: ${msg.metrics.model}`;
      if (msg.metrics.provider) md += ` | Provider: ${msg.metrics.provider}`;
      md += "\n\n";
    }
  }

  md += `---\n\n_Exported via AnythingLLM API_\n`;
  return md;
}

export interface AnythingLLMIngestResult {
  found: number;
  exported: number;
  indexed: number;
  errors: string[];
  exportDir: string;
}

export async function anythingllmIngestSessions(params: {
  workspace?: string;
  thread?: string;
}): Promise<AnythingLLMIngestResult> {
  const key = await getApiKey();
  const result: AnythingLLMIngestResult = {
    found: 0,
    exported: 0,
    indexed: 0,
    errors: [],
    exportDir: SESSIONS_DIR,
  };
  await mkdir(SESSIONS_DIR, { recursive: true });

  const workspaces = await withApiTimeout(fetchWorkspaces(key), "listWorkspaces");
  const targets = params.workspace
    ? workspaces.filter((w) => w.slug === params.workspace)
    : workspaces;
  if (params.workspace && targets.length === 0) {
    throw new Error(`Workspace not found: ${params.workspace}`);
  }

  const ingestOne = async (ws: Workspace, threadSlug?: string) => {
    let messages: ChatMessage[];
    try {
      messages = await withApiTimeout(fetchChats(key, ws.slug, threadSlug), "fetchChats");
    } catch (e) {
      result.errors.push(`${ws.slug}${threadSlug ? `/${threadSlug}` : ""}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (messages.length === 0) return;
    result.found += messages.length;

    const ts = new Date().toISOString().split("T")[0];
    const safe = ws.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
    const tSafe = threadSlug ? `_thread_${threadSlug.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
    const filename = `${ts}_AnythingLLM_${safe}${tSafe}.md`;
    const filepath = join(SESSIONS_DIR, filename);

    try {
      let md = buildFrontmatter(ws.slug, messages.length, threadSlug);
      md += `# AnythingLLM — ${ws.name}${threadSlug ? `\n\nThread: ${threadSlug}` : ""}\n\n`;
      md += buildChatBody(messages);
      await writeFile(filepath, md, "utf-8");
      result.exported++;
    } catch (e) {
      result.errors.push(`export ${filename}: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const text = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");
      const docId = `anythingllm-${ws.slug}${threadSlug ? `-${threadSlug}` : "-main"}`;
      await ragAdd({
        collection: "sessions",
        id: docId,
        text,
        metadata: {
          source: "anythingllm",
          workspace: ws.slug,
          thread: threadSlug ?? "main",
          messages: String(messages.length),
          date: ts,
        },
      });
      result.indexed++;
    } catch (e) {
      result.errors.push(`index ${ws.slug}${threadSlug ? `/${threadSlug}` : ""}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  for (const ws of targets) {
    if (params.thread) {
      await ingestOne(ws, params.thread);
    } else {
      await ingestOne(ws, undefined);
      if (ws.threads && ws.threads.length > 0) {
        for (const t of ws.threads) {
          await ingestOne(ws, t.slug);
        }
      }
    }
  }

  return result;
}
