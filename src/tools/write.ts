import { writeFile, mkdir } from "fs/promises";
import { dirname, resolve } from "path";

interface WriteArgs {
  path: string;
  content: string;
}

export async function writeTool(args: WriteArgs, workspace: string): Promise<any> {
  const { path: filePath, content } = args;
  const fullPath = resolve(workspace, filePath);

  // Security: prevent writing outside workspace
  if (!fullPath.startsWith(resolve(workspace))) {
    throw new Error("Invalid path: outside workspace");
  }

  try {
    const dir = dirname(fullPath);
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, "utf-8");

    return {
      content: [{
        type: "text",
        text: `File written successfully: ${filePath}`,
      }],
    };
  } catch (error) {
    throw new Error(`Cannot write file: ${(error as Error).message}`);
  }
}
