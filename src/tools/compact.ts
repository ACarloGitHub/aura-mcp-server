import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { homedir } from "os";

const execFileAsync = promisify(execFile);

const LM_STUDIO_CHAT_URL = process.env.LM_STUDIO_URL || "http://localhost:1234/v1/chat/completions";
const CONVERSATIONS_DIR = process.env.LM_STUDIO_CONVERSATIONS_DIR || join(homedir(), ".lmstudio", "conversations");
const WORKSPACE = process.env.AGENT_WORKSPACE || process.cwd();
const COMPACTED_DIR = join(WORKSPACE, "compacted-sessions");
const MEMORY_PATH = join(WORKSPACE, "MEMORY.md");
const ARCHIVE_PATH = join(WORKSPACE, "memory-archive.md");
const DEFAULT_THRESHOLD = 300;

interface CompactArgs {
  action: "memory" | "session" | "status" | "list";
  session?: string;
  model?: string;
  threshold?: number;
}

// ============================================================
// MAIN ENTRY
// ============================================================
export async function compactTool(args: CompactArgs): Promise<any> {
  try {
    switch (args.action) {
      case "memory":
        return await memoryCompact(args);
      case "session":
        return await sessionCompact(args);
      case "status":
        return await compactStatus(args);
      case "list":
        return await listCompacted();
      default:
        throw Error(`Unknown compact action: ${args.action}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `Compact error: ${msg}` }], isError: true };
  }
}

// ============================================================
// MEMORY COMPACTION (automatic)
// Archives old MEMORY.md content when it exceeds threshold,
// keeping only the structural header + compaction note.
// ============================================================
async function memoryCompact(args: CompactArgs): Promise<any> {
  const threshold = args.threshold || DEFAULT_THRESHOLD;

  let content: string;
  try {
    content = await readFile(MEMORY_PATH, "utf-8");
  } catch {
    return { content: [{ type: "text" as const, text: "MEMORY.md not found. Nothing to compact." }] };
  }

  const lines = content.split("\n");
  if (lines.length <= threshold) {
    return {
      content: [{
        type: "text" as const,
        text: `MEMORY.md: ${lines.length} lines (threshold: ${threshold}). Compaction not needed.`
      }]
    };
  }

  // Find first "## Note" section — everything below it gets archived
  const noteIdx = lines.findIndex(l => /^## Notes?\b/i.test(l));
  let preserved: string;
  let toArchive: string;

  if (noteIdx >= 0) {
    preserved = lines.slice(0, noteIdx).join("\n").trimEnd();
    toArchive = lines.slice(noteIdx).join("\n");
  } else {
    // No Note section: preserve first 20 lines (header), archive the rest
    preserved = lines.slice(0, 20).join("\n").trimEnd();
    toArchive = content;
  }

  const timestamp = new Date().toISOString().split("T")[0];
  const archiveEntry = `\n\n## Compacted - ${timestamp}\n\n${toArchive.trim()}\n`;

  // Append to existing archive
  let archive = "";
  try {
    archive = await readFile(ARCHIVE_PATH, "utf-8");
  } catch { /* doesn't exist yet */ }

  archive += archiveEntry;
  await writeFile(ARCHIVE_PATH, archive, "utf-8");

  // Write compacted MEMORY.md — header + fresh empty Note section
  const compacted = preserved + `\n\n## Note\n\n[Memory compacted on ${timestamp}. Previous history in memory-archive.md]\n`;
  await writeFile(MEMORY_PATH, compacted, "utf-8");

  const newLines = compacted.split("\n").length;

  return {
    content: [{
      type: "text" as const,
      text: `Memory compacted!\n- ${lines.length} lines → ${newLines} lines\n- Archived to memory-archive.md\n- Date: ${timestamp}`
    }]
  };
}

// ============================================================
// SESSION COMPACTION
// Reads an LM Studio .conversation.json, summarizes via model,
// saves to compacted-sessions/ and indexes in ChromaDB (optional).
// ============================================================
async function sessionCompact(args: CompactArgs): Promise<any> {
  if (!args.session) {
    return await listSessions();
  }

  const parts = args.session.split("/");
  if (parts.length < 2) {
    throw new Error("Invalid session format. Use: 'FolderName/file.conversation.json'");
  }

  const sessionPath = join(CONVERSATIONS_DIR, args.session);

  let convData: any;
  try {
    const raw = await readFile(sessionPath, "utf-8");
    convData = JSON.parse(raw);
  } catch {
    throw new Error(`Cannot read session: ${sessionPath}`);
  }

  const name = convData.name || "Untitled";
  const conversationText = extractConversationText(convData);

  if (!conversationText.trim()) {
    return { content: [{ type: "text" as const, text: `Session "${name}" has no content to compact.` }] };
  }

  // Generate summary via model
  const summary = await summarize(conversationText, args.model);

  // Create directory and save
  await mkdir(COMPACTED_DIR, { recursive: true });
  const timestamp = new Date().toISOString().split("T")[0];
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${timestamp}_${safeName}.md`;
  const compactedPath = join(COMPACTED_DIR, filename);

  const compactedContent = `# Compacted Session: ${name}\n\nCompaction date: ${timestamp}\nOriginal file: ${args.session}\nOriginal messages: ${convData.messages?.length || 0}\n\n---\n\n${summary}\n`;

  await writeFile(compactedPath, compactedContent, "utf-8");

  return {
    content: [{
      type: "text" as const,
      text: `Session "${name}" compacted!\n\n- Summary saved to: compacted-sessions/${filename}\n- Original messages: ${convData.messages?.length || 0}\n\nTo recover context in a new session:\n1. Create a new empty session\n2. Ask the model: "Load context from compacted session ${name}"`
    }]
  };
}

// ============================================================
// STATUS — shows memory + session state
// ============================================================
async function compactStatus(args: CompactArgs): Promise<any> {
  const results: string[] = [];

  // Memory status
  try {
    const content = await readFile(MEMORY_PATH, "utf-8");
    const lines = content.split("\n").length;
    const needsCompact = lines > DEFAULT_THRESHOLD;
    results.push(`MEMORY.md: ${lines} lines (threshold: ${DEFAULT_THRESHOLD})${needsCompact ? " - COMPACTION RECOMMENDED" : ""}`);
  } catch {
    results.push("MEMORY.md: not found");
  }

  // Archive status
  try {
    const content = await readFile(ARCHIVE_PATH, "utf-8");
    const sizeKB = Math.round(Buffer.byteLength(content, "utf-8") / 1024);
    results.push(`memory-archive.md: ${sizeKB} KB`);
  } catch {
    results.push("memory-archive.md: does not exist yet");
  }

  // Session status (if specified)
  if (args.session) {
    const parts = args.session.split("/");
    if (parts.length >= 2) {
      const sessionPath = join(CONVERSATIONS_DIR, args.session);
      try {
        const raw = await readFile(sessionPath, "utf-8");
        const convData = JSON.parse(raw);
        const msgCount = convData.messages?.length || 0;
        const sizeKB = Math.round(Buffer.byteLength(raw, "utf-8") / 1024);
        results.push(`Session "${convData.name || "Untitled"}": ${msgCount} messages, ${sizeKB} KB`);
      } catch {
        results.push(`Session "${args.session}": not found`);
      }
    }
  }

  // Compacted sessions
  try {
    const files = await readdir(COMPACTED_DIR);
    const mdFiles = files.filter(f => f.endsWith(".md"));
    results.push(`compacted-sessions/: ${mdFiles.length} session(s) compacted`);
  } catch {
    results.push("compacted-sessions/: empty or does not exist");
  }

  return { content: [{ type: "text" as const, text: results.join("\n") }] };
}

// ============================================================
// LIST COMPACTED — lists all compacted session files
// ============================================================
async function listCompacted(): Promise<any> {
  try {
    const files = await readdir(COMPACTED_DIR);
    const mdFiles = files.filter(f => f.endsWith(".md")).sort().reverse();

    if (mdFiles.length === 0) {
      return { content: [{ type: "text" as const, text: "No compacted sessions found." }] };
    }

    const list = mdFiles.map((f, i) => `${i + 1}. ${f.replace(".md", "")}`).join("\n");
    return { content: [{ type: "text" as const, text: `Compacted sessions:\n\n${list}` }] };
  } catch {
    return { content: [{ type: "text" as const, text: "compacted-sessions/ folder not found." }] };
  }
}

// ============================================================
// HELPERS
// ============================================================
async function listSessions(): Promise<any> {
  const folders: Record<string, string[]> = {};

  try {
    const entries = await readdir(CONVERSATIONS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderPath = join(CONVERSATIONS_DIR, entry.name);
      try {
        const files = await readdir(folderPath);
        const convFiles = files.filter(f => f.endsWith(".conversation.json"));
        if (convFiles.length > 0) folders[entry.name] = convFiles;
      } catch { /* skip */ }
    }
  } catch {
    throw new Error(`Conversations directory not found: ${CONVERSATIONS_DIR}`);
  }

  const formatted = Object.entries(folders).map(([folder, files]) => {
    const fileList = files.map(f => `  - ${folder}/${f}`).join("\n");
    return `${folder} (${files.length}):\n${fileList}`;
  }).join("\n\n");

  const total = Object.values(folders).reduce((s, f) => s + f.length, 0);

  return {
    content: [{
      type: "text" as const,
      text: `LM Studio sessions (${total} total):\n\n${formatted}\n\nSpecify a session with: action=session, session="FolderName/file.conversation.json"`
    }]
  };
}

function extractConversationText(convData: any): string {
  const parts: string[] = [];

  for (const msg of convData.messages || []) {
    const versions = msg.versions || [];
    if (!versions.length) continue;

    const version = versions[versions.length - 1];
    const role = version.role || version.type || "unknown";

    if (role === "user") {
      const contents = version.content || [];
      for (const c of contents) {
        if (typeof c === "object" && c.text) parts.push(`User: ${c.text}`);
      }
    } else if (role === "assistant") {
      const steps = version.steps || [];
      for (const step of steps) {
        const stepContent = step.content || [];
        for (const sc of stepContent) {
          if (typeof sc === "object" && sc.text) {
            if (sc.type === "thinking" || sc.isStructural) continue;
            parts.push(`Assistant: ${sc.text}`);
          }
        }
      }
    }
  }

  return parts.join("\n\n");
}

async function summarize(text: string, model?: string): Promise<string> {
  const CHUNK_SIZE = 12000;
  const textLines = text.split("\n");

  if (textLines.length * 50 < CHUNK_SIZE) {
    return await summarizeChunk(text, model, true);
  }

  // Split into chunks of ~12000 characters
  const chunks: string[] = [];
  let current = "";
  for (const line of textLines) {
    if (current.length + line.length > CHUNK_SIZE && current.length > 0) {
      chunks.push(current.trim());
      current = line + "\n";
    } else {
      current += line + "\n";
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Phase 1: summarize each chunk
  const summaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const s = await summarizeChunk(chunks[i], model, isLast);
    summaries.push(`[Part ${i + 1}/${chunks.length}]\n${s}`);
  }

  if (summaries.length === 1) return summaries[0];

  // Phase 2: recompact partial summaries into one final summary
  const combined = summaries.join("\n\n---\n\n");
  return await summarizeChunk(combined, model, true, true);
}

const PROMPT_FULL = `You are an assistant that compacts conversations. Summarize the following conversation, preserving:
1. Decisions made and results achieved
2. Key concepts and important information
3. Relevant technical details (commands, configurations, errors)
4. General context and work status

Ignore greetings, trivial confirmations, and intermediate model reasoning.

Write the summary in plain markdown, concise but complete.

CONVERSATION:

{input}

SUMMARY:`;

const PROMPT_RECOMPACT = `You are an assistant that merges partial conversation summaries.
Combine the following partial summaries into a single coherent, concise summary.

PARTIAL SUMMARIES:

{input}

FINAL SUMMARY:`;

async function summarizeChunk(text: string, model?: string, isLast: boolean = true, isRecompact: boolean = false): Promise<string> {
  const maxTokens = isRecompact ? 1500 : (isLast ? 1000 : 800);
  const promptTemplate = isRecompact ? PROMPT_RECOMPACT : PROMPT_FULL;
  const prompt = promptTemplate.replace("{input}", text);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    const response = await fetch(LM_STUDIO_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "",
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json() as any;
    const summary = data.choices?.[0]?.message?.content || "";

    if (!summary.trim()) {
      return "(Summary not generated)";
    }
    return summary;
  } catch (error) {
    return `(Chunk error: ${error})`;
  }
}

