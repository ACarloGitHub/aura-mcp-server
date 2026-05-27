import { readFile, writeFile, readdir, mkdir, appendFile } from "fs/promises";
import { join, resolve, dirname } from "path";
import { getWorkspaceRoot, textResult, formatError } from "../utils/helpers.js";

interface CompactArgs {
  action: "memory" | "status" | "list";
  threshold?: number;
}

function getWorkspace(): string {
  return getWorkspaceRoot();
}

const COMPACTED_DIR = () => join(getWorkspace(), "compacted-sessions");
const MEMORY_THRESHOLD_DEFAULT = 300;

export async function compactTool(args: CompactArgs): Promise<any> {
  try {
    switch (args.action) {
      case "memory":
        return await memoryCompact(args);
      case "status":
        return await compactStatus(args);
      case "list":
        return await listCompacted();
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
    return textResult("MEMORY.md not found. Nothing to compact.");
  }

  const lines = content.split("\n");
  if (lines.length <= threshold) {
    return textResult(`MEMORY.md: ${lines.length} lines (threshold: ${threshold}). Compaction not needed.`);
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
  return textResult(
    `Memory compacted!\n- ${lines.length} lines → ${newLines} lines\n- Archived in memory-archive.md\n- Date: ${timestamp}`
  );
}

async function compactStatus(_args: CompactArgs): Promise<any> {
  const results: string[] = [];
  const workspace = getWorkspace();

  const memoryPath = resolve(workspace, "MEMORY.md");
  try {
    const content = await readFile(memoryPath, "utf-8");
    const lines = content.split("\n").length;
    const needsCompact = lines > MEMORY_THRESHOLD_DEFAULT;
    results.push(
      `MEMORY.md: ${lines} righe (soglia: ${MEMORY_THRESHOLD_DEFAULT})${needsCompact ? " - COMPACTION RECOMMENDED" : ""}`
    );
  } catch {
    results.push("MEMORY.md: not found");
  }

  const archivePath = resolve(workspace, "memory-archive.md");
  try {
    const content = await readFile(archivePath, "utf-8");
    const archSize = Math.round(Buffer.byteLength(content, "utf-8") / 1024);
    results.push(`memory-archive.md: ${archSize} KB`);
  } catch {
    results.push("memory-archive.md: doesn't exist yet");
  }

  try {
    const files = await readdir(COMPACTED_DIR());
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    results.push(`compacted-sessions/: ${mdFiles.length} compacted sessions`);
  } catch {
    results.push("compacted-sessions/: empty or does not exist");
  }

  return textResult(results.join("\n"));
}

async function listCompacted(): Promise<any> {
  try {
    const files = await readdir(COMPACTED_DIR());
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse();

    if (mdFiles.length === 0) return textResult("No compacted sessions.");

    const list = mdFiles.map((f, i) => `${i + 1}. ${f.replace(".md", "")}`).join("\n");
    return textResult(`Compacted sessions:\n\n${list}`);
  } catch {
    return textResult("compacted-sessions/ directory not found.");
  }
}
