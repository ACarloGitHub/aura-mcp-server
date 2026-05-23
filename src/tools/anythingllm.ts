import { writeFile, mkdir, readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getWorkspaceRoot, textResult, formatError } from "../utils/helpers.js";

const WORKSPACE = getWorkspaceRoot();
const SESSIONI_DIR = join(WORKSPACE, "SessioniAnythingllm");
const API_BASE = process.env.ANYTHINGLLM_BASE_URL || "http://localhost:3001/api/v1";

// Resolve the server root directory (where api-key.json should be placed)
// @ts-ignore — import.meta.url valido in ESM Node16
const _serverDir = dirname(dirname(fileURLToPath(import.meta.url)));

async function getApiKey(argsKey?: string): Promise<string> {
  // 1. Parametro diretto nel tool
  if (argsKey) return argsKey;

  // 2. Env var
  if (process.env.ANYTHINGLLM_API_KEY) return process.env.ANYTHINGLLM_API_KEY;

  // 3. File api-key.json nella cartella del server (e.g. aura-mcp-server/api-key.json)
  //    Cerca prima nella dir del server, poi nel workspace
  const candidates = [
    join(_serverDir, "api-key.json"),
    join(WORKSPACE, "api-key.json"),
  ];
  for (const configPath of candidates) {
    try {
      const raw = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.anythingllm_api_key && parsed.anythingllm_api_key !== "INSERISCI-QUI-LA-TUA-API-KEY") {
        return parsed.anythingllm_api_key;
      }
    } catch {
      // ignore, try next candidate
    }
  }

  throw new Error(
    "API key AnythingLLM non trovata. " +
    "Inseriscila in api-key.json (cartella del server) oppure imposta la variabile d'ambiente ANYTHINGLLM_API_KEY."
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

export async function anythingllmTool(args: AnythingLLMArgs): Promise<any> {
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
        throw new Error(`Azione anythingllm sconosciuta: ${args.action}`);
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
    return textResult("Nessun workspace trovato in AnythingLLM.");
  }

  const lines: string[] = ["Workspace AnythingLLM disponibili:\n"];
  for (const ws of workspaces) {
    lines.push(`  ${ws.name} (slug: ${ws.slug})`);
    if (ws.threads && ws.threads.length > 0) {
      for (const t of ws.threads) {
        lines.push(`    - Thread: "${t.name}" (slug: ${t.slug})`);
      }
    } else {
      lines.push(`    - Nessun thread`);
    }
    lines.push("");
  }

  lines.push(`Totale: ${workspaces.length} workspace`);
  lines.push(`\nPer esportare: action=export workspace="slug" [thread="slugthread"]`);
  lines.push(`Per esportare tutto: action=export-all`);

  return textResult(lines.join("\n"));
}

async function exportChats(apiKey: string, workspaceSlug?: string, threadSlug?: string): Promise<any> {
  if (!workspaceSlug) {
    return await listWorkspaces(apiKey);
  }

  const messages = await withApiTimeout(fetchChats(apiKey, workspaceSlug, threadSlug), "exportChats");

  if (messages.length === 0) {
    return textResult(
      `Nessuna chat trovata per workspace "${workspaceSlug}"${threadSlug ? ` / thread "${threadSlug}"` : ""}.`
    );
  }

  await mkdir(SESSIONI_DIR, { recursive: true });

  const timestamp = new Date().toISOString().split("T")[0];
  const safeSlug = workspaceSlug.replace(/[^a-zA-Z0-9_-]/g, "_");
  const suffix = threadSlug ? `_thread_${threadSlug.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
  const filename = `${timestamp}_AnythingLLM_${safeSlug}${suffix}.md`;
  const filepath = join(SESSIONI_DIR, filename);

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
  md += `\nEsportato il ${new Date().toLocaleDateString("en-US")}\n`;
  md += `Messaggi: ${messages.length}\n\n`;
  md += `---\n\n`;

  for (const msg of messages) {
    const dateStr = msg.sentAt ? new Date(msg.sentAt * 1000).toLocaleString("en-US") : "data sconosciuta";
    const role = msg.role === "user" ? "Utente" : "Assistente";
    md += `### ${role} — ${dateStr}\n\n`;
    md += `${msg.content}\n\n`;

    if (msg.metrics?.model) {
      md += `> Modello: ${msg.metrics.model} | Provider: ${msg.metrics.provider || "sconosciuto"}\n\n`;
    }
  }

  md += `---\n\n_Esportato via AnythingLLM API_`;

  await writeFile(filepath, md, "utf-8");

  return textResult(
    `Esportazione completata!\n\n- Workspace: ${workspaceSlug}${threadSlug ? ` / Thread: ${threadSlug}` : ""}\n- Messaggi: ${messages.length}\n- Salvato in: SessioniAnythingllm/${filename}`
  );
}

async function exportAll(apiKey: string): Promise<any> {
  await mkdir(SESSIONI_DIR, { recursive: true });

  const workspaces = await withApiTimeout(fetchWorkspaces(apiKey), "exportAll");
  const results: string[] = [];

  for (const ws of workspaces) {
    const mainMessages = await fetchChats(apiKey, ws.slug);
    if (mainMessages.length > 0) {
      const timestamp = new Date().toISOString().split("T")[0];
      const safeSlug = ws.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `${timestamp}_AnythingLLM_${safeSlug}.md`;
      const filepath = join(SESSIONI_DIR, filename);

      let md = buildFrontmatter(ws.slug, mainMessages.length);
      md += `# AnythingLLM — ${ws.name}\n\nChat principale del workspace.\n\n`;
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
          const filepath = join(SESSIONI_DIR, filename);

          let md = buildFrontmatter(ws.slug, threadMessages.length, t.slug);
          md += `# AnythingLLM — ${ws.name}\n\nThread: ${t.name}\n\n`;
          md += buildChatBody(threadMessages);

          await writeFile(filepath, md, "utf-8");
          results.push(`  ${ws.name} / ${t.name}: ${threadMessages.length} msg → ${filename}`);
        }
      }
    }
  }

  if (results.length === 0) return textResult("Nessuna chat da esportare.");

  return textResult(
    `Esportazione completa!\n\n${results.join("\n")}\n\nTotale: ${results.length} file salvati in SessioniAnythingllm/`
  );
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
    throw new Error(`API error (${res.status}) per ${url}: ${err}`);
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
