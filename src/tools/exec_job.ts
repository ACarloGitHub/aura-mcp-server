import {
  execPollTool,
  execKillTool,
  execListTool,
  execCleanTool,
} from "./exec.js";

export interface ExecJobArgs {
  action: "poll" | "kill" | "list" | "clean";
  jobId?: string;
  tail?: number;
  maxAgeHours?: number;
  all?: boolean;
  [k: string]: unknown;
}

export async function execJobTool(args: ExecJobArgs): Promise<any> {
  const { action, ...rest } = args;
  switch (action) {
    case "poll":
      return execPollTool(rest as any);
    case "kill":
      return execKillTool(rest as any);
    case "list":
      return execListTool();
    case "clean":
      return execCleanTool(rest as any);
    default:
      return {
        content: [{ type: "text", text: `Error: unknown exec_job action: ${action}` }],
        isError: true,
      };
  }
}
