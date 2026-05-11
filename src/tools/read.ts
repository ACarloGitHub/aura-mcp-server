import { readFile, stat } from "fs/promises";
import { extname } from "path";
import { resolveWorkspacePath, isBinaryBuffer } from "../utils/helpers.js";

interface ReadArgs {
  path: string;
  offset?: number;
  limit?: number;
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const MAX_TEXT_LINES = 2000;
const MAX_TEXT_CHARS = 100_000; // 100KB di testo
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB max per qualsiasi file
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB max per immagini

export async function readTool(args: ReadArgs): Promise<any> {
  const { path: rawPath, offset = 1, limit } = args;
  const filePath = resolveWorkspacePath(rawPath);

  try {
    const ext = extname(filePath).toLowerCase();
    const isImage = IMAGE_EXTENSIONS.includes(ext);

    // Prima controlla la dimensione
    let size = 0;
    try {
      const s = await stat(filePath);
      size = s.size;
    } catch {
      // se stat fallisce, proviamo a leggere comunque
    }

    if (size > MAX_FILE_SIZE_BYTES) {
      return {
        content: [
          {
            type: "text",
            text: `File troppo grande (${Math.round(size / 1024 / 1024)}MB > ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB): ${filePath}\nSuggerimento: usa exec per processare il file a pezzi.`,
          },
        ],
        isError: true,
      };
    }

    const content = await readFile(filePath);

    if (isImage) {
      if (size > MAX_IMAGE_SIZE_BYTES) {
        return {
          content: [
            {
              type: "text",
              text: `Immagine troppo grande (${Math.round(size / 1024)}KB > ${MAX_IMAGE_SIZE_BYTES / 1024}KB): ${filePath}`,
            },
          ],
          isError: true,
        };
      }
      const base64 = content.toString("base64");
      const mimeType =
        ext === ".png" ? "image/png" :
        ext === ".gif" ? "image/gif" :
        ext === ".webp" ? "image/webp" : "image/jpeg";

      return {
        content: [
          { type: "image", data: base64, mimeType },
        ],
      };
    }

    // Rileva binario
    if (isBinaryBuffer(content)) {
      return {
        content: [
          {
            type: "text",
            text: `File binario rilevato (${filePath}). Non puo' essere letto come testo.`,
          },
        ],
        isError: true,
      };
    }

    const text = content.toString("utf-8");
    const lines = text.split("\n");
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
    const parts: string[] = [];
    if (offset > 1) parts.push(`offset: ${offset}`);
    if (hasMore) parts.push(`+${lines.length - endLine} linee rimanenti (totale ${lines.length})`);
    if (truncated) parts.push(`troncato a ${MAX_TEXT_CHARS} caratteri`);
    const footer = parts.length > 0 ? `\n\n[${parts.join(", ")}]` : "";

    return {
      content: [
        { type: "text", text: output + footer },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Impossibile leggere il file: ${msg}` }],
      isError: true,
    };
  }
}
