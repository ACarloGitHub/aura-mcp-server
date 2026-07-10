import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { ragAdd } from "./index.js";
import { resolveServerDir } from "./config.js";

const DEFAULT_CONVERSATIONS_DIR = join(homedir(), ".lmstudio", "conversations");

function conversationsDir(): string {
  return process.env.LM_STUDIO_CONVERSATIONS_DIR || DEFAULT_CONVERSATIONS_DIR;
}

function exportDir(): string {
  return join(resolveServerDir(), "Sessions");
}

interface ParsedMessage {
  role: string;
  content: string;
}

interface ParsedConversation {
  name: string;
  folder: string;
  created_at: number;
  created_timestamp: number;
  model: string;
  preset: string;
  token_count: number;
  system_prompt: string;
  messages: ParsedMessage[];
  filepath: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function parseConversation(filepath: string): Promise<ParsedConversation | null> {
  let raw: string;
  try {
    raw = await readFile(filepath, "utf-8");
  } catch {
    return null;
  }
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const messages: ParsedMessage[] = [];
  const rawMessages: any[] = Array.isArray(data?.messages) ? data.messages : [];

  for (const msg of rawMessages) {
    const versions: any[] = Array.isArray(msg?.versions) ? msg.versions : [];
    if (versions.length === 0) continue;
    const version = versions[versions.length - 1];
    const role = asString(version?.role || version?.type || "unknown");
    let contentText = "";

    if (role === "user") {
      const contents = version?.content;
      const parts: string[] = [];
      if (Array.isArray(contents)) {
        for (const c of contents) {
          if (typeof c === "string") parts.push(c);
          else if (c && typeof c === "object") {
            const t = asString(c.text || c.content);
            if (t) parts.push(t);
          }
        }
      } else if (typeof contents === "string") {
        parts.push(contents);
      }
      contentText = parts.join(" ");
    } else if (role === "assistant") {
      const steps: any[] = Array.isArray(version?.steps) ? version.steps : [];
      const stepTexts: string[] = [];
      steps.forEach((step, idx) => {
        const sc = step?.content;
        if (Array.isArray(sc)) {
          for (const seg of sc) {
            if (seg && typeof seg === "object") {
              const text = asString(seg.text);
              const segType = asString(seg.type);
              const isStructural = !!seg.isStructural;
              if (text && segType !== "thinking" && !isStructural) {
                if (idx === 0 && text.startsWith("Here") && text.slice(0, 50).toLowerCase().includes("thinking process")) {
                  continue;
                }
                stepTexts.push(text);
              }
            } else if (typeof seg === "string" && seg.trim()) {
              stepTexts.push(seg);
            }
          }
        } else if (typeof sc === "string" && sc.trim()) {
          stepTexts.push(sc);
        }
      });
      contentText = stepTexts.join("\n");
    }

    if (contentText.trim()) {
      messages.push({ role, content: contentText.trim() });
    }
  }

  const lastUsedModel = data?.lastUsedModel;
  const modelId =
    lastUsedModel && typeof lastUsedModel === "object" ? asString(lastUsedModel.identifier) || "unknown" : "unknown";

  const folder = filepath.split(/[\\/]/).slice(-2, -1)[0] || "";
  const createdAt = Number(data?.createdAt) || 0;

  return {
    name: asString(data?.name) || "Untitled",
    folder,
    created_at: createdAt,
    created_timestamp: createdAt,
    model: modelId,
    preset: asString(data?.preset),
    token_count: Number(data?.tokenCount) || 0,
    system_prompt: asString(data?.systemPrompt),
    messages,
    filepath,
  };
}

function conversationToMarkdown(conv: ParsedConversation): string {
  const lines: string[] = [];
  const tags = ["lm-studio", "session", conv.folder.toLowerCase().replace(/\s+/g, "-")].filter(Boolean).join(", ");
  lines.push("---");
  lines.push(`title: "${conv.name}"`);
  lines.push(`type: session`);
  lines.push(`tags: [${tags}]`);
  lines.push(`created: ${conv.created_at}`);
  lines.push(`model: ${conv.model}`);
  if (conv.preset) lines.push(`preset: ${conv.preset}`);
  lines.push(`tokens: ${conv.token_count}`);
  lines.push(`folder: ${conv.folder}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${conv.name}`);
  lines.push("");
  lines.push(`**Date:** ${conv.created_at}  `);
  lines.push(`**Model:** ${conv.model}  `);
  if (conv.preset) lines.push(`**Preset:** ${conv.preset}  `);
  lines.push(`**Tokens:** ${conv.token_count}  `);
  lines.push("");
  if (conv.system_prompt) {
    lines.push("## System Prompt");
    lines.push("");
    const sp = conv.system_prompt;
    lines.push(`> ${sp.slice(0, 500)}${sp.length > 500 ? "..." : ""}`);
    lines.push("");
  }
  lines.push("## Conversation");
  lines.push("");
  for (const msg of conv.messages) {
    const label =
      msg.role === "user" ? "**User**" : msg.role === "assistant" ? "**Assistant**" : msg.role === "system" ? "**System**" : `**${msg.role}**`;
    let content = msg.content;
    if (content.length > 2000) content = content.slice(0, 2000) + "\n...[truncated]";
    lines.push(`${label}:`);
    lines.push("");
    lines.push(content);
    lines.push("");
  }
  lines.push("---");
  return lines.join("\n");
}

async function findConversations(folder?: string): Promise<string[]> {
  const base = conversationsDir();
  if (!existsSync(base)) return [];
  const out: string[] = [];

  async function walk(dir: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let s;
      try {
        s = await stat(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        await walk(full);
      } else if (entry.endsWith(".conversation.json")) {
        out.push(full);
      }
    }
  }

  if (folder) {
    await walk(join(base, folder));
  } else {
    await walk(base);
  }
  return out.sort();
}

function safeName(name: string, ts: number): string {
  const cleaned = name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return cleaned || `session_${ts}`;
}

async function indexConversation(conv: ParsedConversation, reindex: boolean): Promise<{ id: string; chunks: number } | null> {
  const parts: string[] = [];
  for (const msg of conv.messages) {
    if (msg.role === "user") parts.push(`User: ${msg.content}`);
    else if (msg.role === "assistant") parts.push(`Assistant: ${msg.content}`);
  }
  const fullText = parts.join("\n\n");
  if (!fullText.trim()) return null;

  const docId = `session-${conv.folder}-${conv.created_timestamp}`;
  const result = await ragAdd({
    collection: "sessions",
    id: docId,
    text: fullText,
    metadata: {
      source: "lm-studio-session",
      folder: conv.folder,
      name: conv.name.slice(0, 100),
      model: conv.model,
      date: conv.created_at,
      tokens: String(conv.token_count),
      reindex: reindex ? "true" : "false",
    },
  });
  return { id: docId, chunks: result.chunks };
}

export interface IngestResult {
  found: number;
  processed: number;
  indexed: number;
  errors: string[];
  exportDir: string;
}

export async function ingestSessions(params: { folder?: string; reindex?: boolean }): Promise<IngestResult> {
  const convs = await findConversations(params.folder);
  const result: IngestResult = {
    found: convs.length,
    processed: 0,
    indexed: 0,
    errors: [],
    exportDir: exportDir(),
  };
  if (convs.length === 0) return result;

  await mkdir(exportDir(), { recursive: true });

  for (const convPath of convs) {
    const conv = await parseConversation(convPath);
    if (!conv) continue;
    result.processed++;

    const folderDir = join(exportDir(), conv.folder);
    await mkdir(folderDir, { recursive: true });
    const mdName = `${safeName(conv.name, conv.created_timestamp)}.md`;
    try {
      await writeFile(join(folderDir, mdName), conversationToMarkdown(conv), "utf-8");
    } catch (e) {
      result.errors.push(`export ${mdName}: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const r = await indexConversation(conv, !!params.reindex);
      if (r) result.indexed++;
    } catch (e) {
      result.errors.push(`index ${conv.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
