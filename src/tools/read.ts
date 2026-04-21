import { readFile } from "fs/promises";
import { extname, resolve } from "path";

interface ReadArgs {
  path: string;
  offset?: number;
  limit?: number;
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const MAX_TEXT_LINES = 2000;
const MAX_TEXT_CHARS = 50000;

export async function readTool(args: ReadArgs, workspace: string): Promise<any> {
  const { path: filePath, offset = 1, limit } = args;
  const fullPath = resolve(workspace, filePath);

  // Security: prevent reading outside workspace
  if (!fullPath.startsWith(resolve(workspace))) {
    throw new Error("Invalid path: outside workspace");
  }

  try {
    const ext = extname(fullPath).toLowerCase();
    const isImage = IMAGE_EXTENSIONS.includes(ext);

    if (isImage) {
      const content = await readFile(fullPath);
      const base64 = content.toString("base64");
      const mimeType =
        ext === ".png" ? "image/png" :
        ext === ".gif" ? "image/gif" :
        ext === ".webp" ? "image/webp" : "image/jpeg";

      return {
        content: [{
          type: "image",
          data: base64,
          mimeType,
        }],
      };
    }

    const content = await readFile(fullPath, "utf-8");
    const lines = content.split("\n");
    const startLine = Math.max(0, offset - 1);
    const endLine = limit !== undefined
      ? Math.min(lines.length, startLine + limit)
      : Math.min(lines.length, startLine + MAX_TEXT_LINES);

    let outputLines = lines.slice(startLine, endLine);
    let output = outputLines.join("\n");
    let truncated = false;

    if (output.length > MAX_TEXT_CHARS) {
      output = output.substring(0, MAX_TEXT_CHARS);
      truncated = true;
    }

    const hasMore = endLine < lines.length;
    let footer = "";
    if (hasMore || truncated || offset > 1) {
      const parts = [];
      if (offset > 1) parts.push(`offset: ${offset}`);
      if (hasMore) parts.push(`+${lines.length - endLine} lines remaining`);
      if (truncated) parts.push(`truncated to ${MAX_TEXT_CHARS} chars`);
      footer = `\n\n[${parts.join(", ")}]`;
    }

    return {
      content: [{
        type: "text",
        text: output + footer,
      }],
    };
  } catch (error) {
    throw new Error(`Cannot read file: ${(error as Error).message}`);
  }
}
