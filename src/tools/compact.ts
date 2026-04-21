import { readFile, writeFile } from "fs/promises";
import { resolve, join } from "path";

interface CompactArgs {
  action: "status" | "compact";
}

const MEMORY_THRESHOLD = 300; // lines
const COMPACT_ARCHIVE = "memory-archive.md";

export async function compactTool(args: CompactArgs, workspace: string): Promise<any> {
  const { action } = args;

  switch (action) {
    case "status":
      return await checkStatus(workspace);
    case "compact":
      return await compactSession(workspace);
    default:
      throw new Error(`Unknown compact action: ${action}`);
  }
}

async function checkStatus(workspace: string): Promise<any> {
  const memoryPath = resolve(workspace, "MEMORY.md");

  try {
    const content = await readFile(memoryPath, "utf-8");
    const lines = content.split("\n").length;
    const needsCompaction = lines > MEMORY_THRESHOLD;

    const status = needsCompaction
      ? `MEMORY.md has ${lines} lines (threshold: ${MEMORY_THRESHOLD}). Compaction recommended.`
      : `MEMORY.md has ${lines} lines. No compaction needed.`;

    return { content: [{ type: "text", text: status }] };
  } catch (error) {
    return { content: [{ type: "text", text: "MEMORY.md not found." }], isError: true };
  }
}

async function compactSession(workspace: string): Promise<any> {
  const memoryPath = resolve(workspace, "MEMORY.md");
  const archivePath = resolve(workspace, COMPACT_ARCHIVE);

  try {
    const content = await readFile(memoryPath, "utf-8");
    const lines = content.split("\n");

    if (lines.length <= MEMORY_THRESHOLD) {
      return { content: [{ type: "text", text: `MEMORY.md has ${lines.length} lines. No compaction needed yet.` }] };
    }

    // Extract key sections: keep the header and migration rules, archive the rest
    const headerEnd = lines.findIndex(l => l.startsWith("## Notes"));
    const preserved = headerEnd >= 0 ? lines.slice(0, headerEnd + 1).join("\n") : lines.slice(0, 20).join("\n");
    const toArchive = headerEnd >= 0 ? lines.slice(headerEnd + 1).join("\n") : content;

    const timestamp = new Date().toISOString().split("T")[0];
    const archiveEntry = `\n\n## Compacted Session - ${timestamp}\n\n${toArchive}`;

    // Append to archive
    let archive = "";
    try {
      archive = await readFile(archivePath, "utf-8");
    } catch (e) { /* archive doesn't exist yet */ }

    archive += archiveEntry;
    await writeFile(archivePath, archive, "utf-8");

    // Write compacted memory
    const compacted = preserved + "\n\n## Notes\n\n[Session compacted on " + timestamp + ". See memory-archive.md for history.]\n";
    await writeFile(memoryPath, compacted, "utf-8");

    return {
      content: [{
        type: "text",
        text: `Session compacted successfully!\n\n- ${lines.length} lines reduced to ~${compacted.split("\n").length} lines\n- Archived to ${COMPACT_ARCHIVE}\n- Date: ${timestamp}\n\nThe agent can now start fresh while preserving key context.`,
      }],
    };
  } catch (error) {
    return { content: [{ type: "text", text: `Compaction error: ${(error as Error).message}` }], isError: true };
  }
}
