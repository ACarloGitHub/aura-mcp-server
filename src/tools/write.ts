import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { resolveWorkspacePath } from "../utils/helpers.js";
import { wrapWithInstruction } from "../utils/resultWrapper.js";

interface WriteArgs {
  path: string;
  content: string;
}

const MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5MB max direct write

export async function writeTool(args: WriteArgs): Promise<any> {
  const { path: rawPath, content } = args;
  const filePath = resolveWorkspacePath(rawPath);

  if (content.length > MAX_CONTENT_LENGTH) {
    return {
      content: [
        {
          type: "text",
          text: `Content too large (${Math.round(content.length / 1024)}KB > ${MAX_CONTENT_LENGTH / 1024}KB). ` +
                `Use the exec tool with shell redirection to write large files.`,
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
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `File written successfully: ${filePath} (${content.length} chars)`,
          "Acknowledge the write and the byte size. Do not echo the content."
        ),
      }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Unable to write file: ${msg}` }],
      isError: true,
    };
  }
}
