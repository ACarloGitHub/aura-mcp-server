import { readFile, writeFile, readdir, mkdir, appendFile } from "fs/promises";
import { join, resolve, dirname, basename } from "path";
import { getWorkspaceRoot, textResult, formatError } from "../utils/helpers.js";
import { wrapWithInstruction } from "../utils/resultWrapper.js";
import { findConversationByTitle } from "../rag/lmstudio.js";
import { estimateTokens, summarizeTranscript, llmModel } from "../utils/localLlm.js";

interface CompactArgs {
  action: "memory" | "status" | "list" | "session";
  threshold?: number;
  title?: string;
  contextLength?: number;
  model?: string;
  keepExchanges?: number;
  chunkTokens?: number;
  maxOutputTokens?: number;
}

function getWorkspace(): string {
  return getWorkspaceRoot();
}

const COMPACTED_DIR = () => join(getWorkspace(), "compacted-sessions");
const MEMORY_THRESHOLD_DEFAULT = 300;
const CONTEXT_LENGTH_DEFAULT = 8192;

export async function compactTool(args: CompactArgs): Promise<any> {
  try {
    switch (args.action) {
      case "memory":
        return await memoryCompact(args);
      case "status":
        return await compactStatus(args);
      case "list":
        return await listCompacted();
      case "session":
        return await compactSession(args);
      default:
        throw new Error(`Unknown compact action: ${args.action}`);
    }
  } catch (error) {
    return formatError(error);
  }
}

async function memoryCompact(args: CompactArgs): Promise<any> {
  const memoryPath = resolve(getWorkspace(), "MEMORY.md");
  const archivePath = resolve(getWorkspace(), "memory-archive.md");
  const threshold = args.threshold || MEMORY_THRESHOLD_DEFAULT;

  let content: string;
  try {
    content = await readFile(memoryPath, "utf-8");
  } catch {
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          "MEMORY.md not found. Nothing to compact.",
          "Acknowledge that there is nothing to compact."
        ),
      }],
    };
  }

  const lines = content.split("\n");
  if (lines.length <= threshold) {
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `MEMORY.md: ${lines.length} lines (threshold: ${threshold}). Compaction not needed.`,
          "Acknowledge that compaction is not needed yet and report the current line count."
        ),
      }],
    };
  }

  const noteIdx = lines.findIndex((l) => /^##\s+Notes?\b/i.test(l));
  let preserved: string;
  let toArchive: string;

  if (noteIdx >= 0) {
    preserved = lines.slice(0, noteIdx).join("\n").trimEnd();
    toArchive = lines.slice(noteIdx).join("\n");
  } else {
    preserved = lines.slice(0, 20).join("\n").trimEnd();
    toArchive = content;
  }

  const timestamp = new Date().toISOString().split("T")[0];
  const archiveEntry = `\n\n## Compacted - ${timestamp}\n\n${toArchive.trim()}\n`;

  let archive = "";
  try {
    archive = await readFile(archivePath, "utf-8");
  } catch { /* doesn't exist yet */ }

  archive += archiveEntry;
  await writeFile(archivePath, archive, "utf-8");

  const compacted = preserved + `\n\n## Note\n\n[Memory compacted on ${timestamp}. Previous history in memory-archive.md]\n`;
  await writeFile(memoryPath, compacted, "utf-8");

  const newLines = compacted.split("\n").length;
  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Memory compacted!\n- ${lines.length} lines → ${newLines} lines\n- Archived in memory-archive.md\n- Date: ${timestamp}`,
        "Confirm the compaction result and where the archive went."
      ),
    }],
  };
}

async function compactStatus(_args: CompactArgs): Promise<any> {
  const lines: string[] = [];
  const structured: {
    memory: { path: string; lines: number | null; threshold: number; compactionRecommended: boolean };
    archive: { path: string; exists: boolean; sizeKB: number | null };
    compactedSessions: { path: string; count: number };
  } = {
    memory: { path: resolve(getWorkspace(), "MEMORY.md"), lines: null, threshold: MEMORY_THRESHOLD_DEFAULT, compactionRecommended: false },
    archive: { path: resolve(getWorkspace(), "memory-archive.md"), exists: false, sizeKB: null },
    compactedSessions: { path: COMPACTED_DIR(), count: 0 },
  };
  const workspace = getWorkspace();

  const memoryPath = resolve(workspace, "MEMORY.md");
  try {
    const content = await readFile(memoryPath, "utf-8");
    const lineCount = content.split("\n").length;
    const needsCompact = lineCount > MEMORY_THRESHOLD_DEFAULT;
    structured.memory.lines = lineCount;
    structured.memory.compactionRecommended = needsCompact;
    lines.push(
      `MEMORY.md: ${lineCount} righe (soglia: ${MEMORY_THRESHOLD_DEFAULT})${needsCompact ? " - COMPACTION RECOMMENDED" : ""}`
    );
  } catch {
    lines.push("MEMORY.md: not found");
  }

  const archivePath = resolve(workspace, "memory-archive.md");
  try {
    const content = await readFile(archivePath, "utf-8");
    const archSize = Math.round(Buffer.byteLength(content, "utf-8") / 1024);
    structured.archive.exists = true;
    structured.archive.sizeKB = archSize;
    lines.push(`memory-archive.md: ${archSize} KB`);
  } catch {
    lines.push("memory-archive.md: doesn't exist yet");
  }

  try {
    const files = await readdir(COMPACTED_DIR());
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    structured.compactedSessions.count = mdFiles.length;
    lines.push(`compacted-sessions/: ${mdFiles.length} compacted sessions`);
  } catch {
    lines.push("compacted-sessions/: empty or does not exist");
  }

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        lines.join("\n"),
        "Briefly summarize memory status. If compaction is recommended, mention it explicitly."
      ),
    }],
    structuredContent: structured,
  };
}

async function listCompacted(): Promise<any> {
  try {
    const files = await readdir(COMPACTED_DIR());
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse();

    if (mdFiles.length === 0) {
      return {
        content: [{
          type: "text",
          text: wrapWithInstruction(
            "No compacted sessions.",
            "Acknowledge the empty list."
          ),
        }],
      };
    }

    const list = mdFiles.map((f, i) => `${i + 1}. ${f.replace(".md", "")}`).join("\n");
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `Compacted sessions:\n\n${list}`,
          "List compacted session filenames briefly. The user can pick one to read."
        ),
      }],
    };
  } catch {
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          "compacted-sessions/ directory not found.",
          "Acknowledge the missing directory."
        ),
      }],
    };
  }
}

function getContextLength(raw: any, override?: number): number {
  if (override && override > 0) return Math.floor(override);
  const env = Number(process.env.AURA_COMPACT_CONTEXT_LENGTH);
  if (env && env > 0) return Math.floor(env);
  const fields: unknown[] = raw?.lastUsedModel?.instanceLoadTimeConfig?.fields ?? [];
  for (const f of fields) {
    if (f && typeof f === "object") {
      const k = (f as any).key;
      const v = (f as any).value;
      if (typeof k === "string" && k.includes("contextLength")) {
        const n = typeof v === "number" ? v : Number(String(v));
        if (n && n > 0) return Math.floor(n);
      }
    } else {
      const m = String(f).match(/llm\.load\.contextLength[^0-9]*(\d+)/);
      if (m) return Number(m[1]);
    }
  }
  return CONTEXT_LENGTH_DEFAULT;
}

function rawRole(rawMsg: any): string {
  const versions: any[] = Array.isArray(rawMsg?.versions) ? rawMsg.versions : [];
  if (versions.length === 0) return "unknown";
  const v = versions[versions.length - 1];
  return typeof v?.role === "string" ? v.role : typeof v?.type === "string" ? v.type : "unknown";
}

function rawMessageText(rawMsg: any): string {
  const versions: any[] = Array.isArray(rawMsg?.versions) ? rawMsg.versions : [];
  if (versions.length === 0) return "";
  const v = versions[versions.length - 1];
  const content = v?.content;
  const parts: string[] = [];
  if (Array.isArray(content)) {
    for (const c of content) {
      if (typeof c === "string") parts.push(c);
      else if (c && typeof c === "object" && typeof c.text === "string") parts.push(c.text);
    }
  } else if (typeof content === "string") {
    parts.push(content);
  }
  return parts.join(" ");
}

async function compactSession(args: CompactArgs): Promise<any> {
  if (!args.title) {
    throw new Error(
      "Required parameter: title (the title of the LM Studio chat to compact). " +
      "LM Studio only: this action reads the chat file on disk."
    );
  }

  const found = await findConversationByTitle(args.title);
  if (!found) {
    throw new Error(
      `No LM Studio conversation found with title "${args.title}". ` +
      "This is an LM Studio-only feature: the chat must exist in the LM Studio " +
      "conversations directory (LM_STUDIO_CONVERSATIONS_DIR or ~/.cache/lm-studio/conversations)."
    );
  }
  const { filepath, conv } = found;
  if (!conv.messages || conv.messages.length === 0) {
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `Chat "${conv.name}" has no messages to compact.`,
          "Acknowledge that the chat is empty."
        ),
      }],
    };
  }

  const raw = JSON.parse(await readFile(filepath, "utf-8"));
  const contextLength = getContextLength(raw, args.contextLength);
  const halfContext = Math.floor(contextLength / 2);

  const model = args.model || llmModel() || (conv.model && conv.model !== "unknown" ? conv.model : undefined);
  if (!model) {
    throw new Error(
      "No model available for summarization. Set AURA_LLM_MODEL (and AURA_LLM_URL if not " +
      "http://localhost:1234/v1/chat/completions), or use a conversation that records a lastUsedModel."
    );
  }

  const transcript = conv.messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const summary = await summarizeTranscript({
    transcript,
    model,
    chunkTokens: args.chunkTokens,
    maxOutputTokens: args.maxOutputTokens,
  });

  const baseSystem = conv.system_prompt ? `${conv.system_prompt.trim()}\n\n` : "";
  const newSystemPrompt = `${baseSystem}[Riepilogo della conversazione precedente]\n${summary}`;

  const userIdx: number[] = [];
  raw.messages.forEach((m: any, i: number) => {
    if (rawRole(m) === "user") userIdx.push(i);
  });
  const requestedExchanges = Math.max(1, Math.min(args.keepExchanges ?? 2, 10));
  const pickKept = (keepExchanges: number): any[] => {
    const total = raw.messages?.length ?? 0;
    const keptIndices = new Set<number>();
    if (userIdx.length > 0) {
      keptIndices.add(userIdx[0]);
      for (let i = userIdx[0] + 1; i < total; i++) {
        if (rawRole(raw.messages[i]) === "assistant") {
          keptIndices.add(i);
          break;
        }
      }
    }
    const startTail = userIdx.length > 0 ? userIdx[Math.max(0, userIdx.length - keepExchanges)] : 0;
    for (let i = startTail; i < total; i++) keptIndices.add(i);
    return (raw.messages as any[]).filter((_, i) => keptIndices.has(i));
  };
  const estimateWith = (msgs: any[]): number =>
    estimateTokens(newSystemPrompt) + estimateTokens(msgs.map(rawMessageText).join("\n"));

  let effectiveExchanges = requestedExchanges;
  let keptMessages = pickKept(effectiveExchanges);
  let estimated = estimateWith(keptMessages);
  let tailReduced = false;
  let summaryOnly = false;

  if (estimated > halfContext && effectiveExchanges > 1) {
    effectiveExchanges = 1;
    tailReduced = true;
    keptMessages = pickKept(effectiveExchanges);
    estimated = estimateWith(keptMessages);
  }
  if (estimated > halfContext) {
    summaryOnly = true;
    keptMessages = [];
    estimated = estimateTokens(newSystemPrompt);
  }

  const finalMessages = keptMessages;

  const newTimestamp = Date.now();
  const newRaw = JSON.parse(JSON.stringify(raw));
  newRaw.name = `${conv.name} -compacted`;
  newRaw.createdAt = newTimestamp;
  newRaw.messages = finalMessages;
  newRaw.systemPrompt = newSystemPrompt;
  if (typeof newRaw.tokenCount === "number") newRaw.tokenCount = 0;
  if (typeof newRaw.userFilesSizeBytes === "number") newRaw.userFilesSizeBytes = 0;

  const newFile = join(dirname(filepath), `${newTimestamp}.conversation.json`);
  await writeFile(newFile, JSON.stringify(newRaw, null, 2), "utf-8");

  await mkdir(COMPACTED_DIR(), { recursive: true });
  const safeName = (conv.name || "session").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "session";
  const dateTag = new Date().toISOString().split("T")[0];
  const seedPath = join(COMPACTED_DIR(), `${safeName}-${dateTag}.seed.md`);
  const mode = summaryOnly
    ? "solo riassunto (sopra il 50% del contesto anche con 1 scambio)"
    : `riassunto + primo scambio + ultime ${effectiveExchanges} exchange${effectiveExchanges > 1 ? "s" : ""}${tailReduced ? " (coda ridotta per rientrare nel budget)" : ""}`;
  const seedContent = [
    `# Seed — ${conv.name}`,
    ``,
    `- Compattata da: ${basename(filepath)}`,
    `- Nuova chat: ${basename(newFile)}`,
    `- Data: ${dateTag}`,
    `- Modalità: ${mode}`,
    ``,
    `## Riepilogo`,
    ``,
    summary,
    ``,
  ].join("\n");
  await writeFile(seedPath, seedContent, "utf-8");

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        [
          `Session compacted (LM Studio only).`,
          ``,
          `Chat: ${conv.name}`,
          `Context: ${contextLength} tokens (half: ${halfContext})`,
          `Estimated compacted: ~${estimated} tokens${tailReduced ? " (tail reduced to 1 exchange)" : ""}${summaryOnly ? " → over budget even with 1 exchange, kept summary only" : ""}`,
          `New chat file: ${newFile}`,
          `Seed file: ${seedPath}`,
          ``,
          `The original conversation was NOT modified. Tell the user to open the new chat "${conv.name} -compacted" in LM Studio to continue with less context.`,
        ].join("\n"),
        "Confirm the compaction result: the new chat file, the seed file, and that the original was left untouched."
      ),
    }],
  };
}
