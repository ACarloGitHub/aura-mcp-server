import { readFile, writeFile } from "fs/promises";
import { resolveWorkspacePath, formatError } from "../utils/helpers.js";
import { wrapWithInstruction } from "../utils/resultWrapper.js";

interface EditArgs {
  path?: string;
  file_path?: string;
  search?: string;
  match?: string;
  oldText?: string;
  old_string?: string;
  replace?: string;
  content?: string;
  newText?: string;
  new_string?: string;
}

/**
 * Edit accepts several parameter aliases so different host invocations of
 * `file(action=edit, ...)` map onto the same underlying implementation.
 */
export async function editTool(args: EditArgs): Promise<any> {
  const filePath = resolveWorkspacePath(args.path || args.file_path || "");
  if (!filePath) return formatError("Required parameter: path or file_path");

  const oldStr = args.old_string || args.oldText || args.search || args.match || "";
  const newStr = args.new_string || args.newText || args.replace || args.content || "";

  if (!oldStr) return formatError("Required parameter: old_string / search / match / oldText");

  try {
    const fileContent = await readFile(filePath, "utf-8");
    if (!fileContent.includes(oldStr)) {
      return formatError(`String not found in file: ${filePath}`);
    }
    const updated = fileContent.replace(oldStr, newStr);
    if (updated === fileContent) {
      return formatError("No changes made");
    }
    await writeFile(filePath, updated, "utf-8");
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `File modified: ${filePath}`,
          "Acknowledge the edit. Show the replaced region briefly if useful."
        ),
      }],
    };
  } catch (error) {
    return formatError(`Edit error: ${(error as Error).message}`);
  }
}
