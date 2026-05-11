import { readdir, stat } from "fs/promises";
import { resolveWorkspacePath, formatError, textResult } from "../utils/helpers.js";

interface ListDirArgs {
  path?: string;
  directory?: string;
  folder?: string;
  dir?: string;
}

/**
 * Alias per filesystem-list-directory.
 * Elenca file e cartelle, scarta hidden.
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
    return textResult(`Directory: ${dirPath}\nTotale: ${entries.length}\n\n📁 Cartelle:\n${dirs.sort().join("\n") || "(nessuna)"}\n\n📄 File:\n${files.sort().join("\n") || "(nessun)"}`);
  } catch (error) {
    return formatError(`Errore listing: ${(error as Error).message}`);
  }
}
