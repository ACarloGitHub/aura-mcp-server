import { readdir, stat } from "fs/promises";
import { resolveWorkspacePath, formatError, textResult } from "../utils/helpers.js";

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
    return textResult(`Directory: ${dirPath}\nTotal: ${entries.length}\n\n📁 Directories:\n${dirs.sort().join("\n") || "(none)"}\n\n📄 Files:\n${files.sort().join("\n") || "(none)"}`);
  } catch (error) {
    return formatError(`Listing error: ${(error as Error).message}`);
  }
}
