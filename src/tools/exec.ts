import { spawn, SpawnOptions } from "child_process";

interface ExecArgs {
  command: string;
  workdir?: string;
  timeout?: number;
  background?: boolean;
  env?: Record<string, string>;
}

export async function execTool(args: ExecArgs, workspace: string): Promise<any> {
  const { command, workdir, timeout = 60, background = false, env } = args;

  const options: SpawnOptions = {
    shell: true,
    cwd: workdir || workspace,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: ["pipe", "pipe", "pipe"],
  };

  if (background) {
    const child = spawn(command, [], options);
    const sessionId = `bg-${Date.now()}-${child.pid}`;
    return {
      content: [{
        type: "text",
        text: `Command started in background (sessionId: ${sessionId}, pid: ${child.pid})`,
      }],
    };
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, [], options);
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 5000);
    }, timeout * 1000);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (data) => { stdout += data; });
    child.stderr?.on("data", (data) => { stderr += data; });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      if (timedOut) {
        resolve({
          content: [{
            type: "text",
            text: `Timeout after ${timeout}s\n\nPartial stdout:\n${stdout}\n\nStderr:\n${stderr}`,
          }],
          isError: true,
        });
        return;
      }
      const output: any[] = [];
      if (stdout) output.push({ type: "text", text: stdout });
      if (stderr) output.push({ type: "text", text: `Stderr:\n${stderr}` });
      if (output.length === 0) output.push({ type: "text", text: `Command completed (exit code: ${code})` });
      resolve({ content: output, isError: code !== 0 });
    });

    child.on("error", (error) => { clearTimeout(timeoutId); reject(error); });
  });
}
