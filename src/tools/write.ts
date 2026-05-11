import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { resolveWorkspacePath } from "../utils/helpers.js";

interface WriteArgs {
  path: string;
  content: string;
}

const MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5MB max scrittura diretta

export async function writeTool(args: WriteArgs): Promise<any> {
  const { path: rawPath, content } = args;
  const filePath = resolveWorkspacePath(rawPath);

  if (content.length > MAX_CONTENT_LENGTH) {
    return {
      content: [
        {
          type: "text",
          text: `Contenuto troppo grande (${Math.round(content.length / 1024)}KB > ${MAX_CONTENT_LENGTH / 1024}KB). ` +
                `Usa il tool exec con redirezione shell per scrivere file grandi.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, content, "utf-8");

    return {
      content: [
        { type: "text", text: `File scritto con successo: ${filePath} (${content.length} chars)` },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Impossibile scrivere il file: ${msg}` }],
      isError: true,
    };
  }
}
