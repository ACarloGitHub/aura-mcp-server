import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";
import { listDirTool } from "./list_dir.js";

export interface FileArgs {
  action: "read" | "write" | "edit" | "list";
  path?: string;
  content?: string;
  search?: string;
  replace?: string;
  offset?: number;
  limit?: number;
  [k: string]: unknown;
}

export async function fileTool(args: FileArgs): Promise<any> {
  const { action, ...rest } = args;
  switch (action) {
    case "read":
      return readTool(rest as any);
    case "write":
      return writeTool(rest as any);
    case "edit":
      return editTool(rest as any);
    case "list":
      return listDirTool(rest as any);
    default:
      return {
        content: [{ type: "text", text: `Error: unknown file action: ${action}` }],
        isError: true,
      };
  }
}
