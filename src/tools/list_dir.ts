import { readdir, stat } from "fs/promises";
import { resolveWorkspacePath, formatError } from "../utils/helpers.js";
import { wrapWithInstruction } from "../utils/resultWrapper.js";

interface ListDirArgs {
  path?: string;
  directory?: string;
  folder?: string;
  dir?: string;
}

/**
 * Alias for filesystem-list-directory.
 * Lists files and directories, skips hidden entries.
 */
export async function listDirTool(args: ListDirArgs): Promise<any> {
  const dirPath = resolveWorkspacePath(args.path || args.directory || args.folder || args.dir || ".");

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];
    const dirs: string[] = [];
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      e.isDirectory() ? dirs.push(`${e.name}/`) : files.push(e.name);
    }
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `Directory: ${dirPath}\nTotal: ${entries.length}\n\nDirectories:\n${dirs.sort().join("\n") || "(none)"}\n\nFiles:\n${files.sort().join("\n") || "(none)"}`,
          "Briefly summarize the directory contents. Highlight any subdirectories the model should care about."
        ),
      }],
    };
  } catch (error) {
    return formatError(`Listing error: ${(error as Error).message}`);
  }
}
