import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { ragAdd } from "./index.js";
import { resolveServerDir } from "./config.js";
import {
  findConversationFiles,
  parseConversation,
  type ParsedConversation,
} from "./lmstudio.js";

function exportDir(): string {
  return join(resolveServerDir(), "Sessions");
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
  const convs = await findConversationFiles(params.folder);
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
