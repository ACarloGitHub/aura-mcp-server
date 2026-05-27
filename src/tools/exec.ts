import { spawn, SpawnOptions } from "child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

interface ExecArgs {
  command: string;
  workdir?: string;
  timeout?: number;
  background?: boolean;
  env?: Record<string, string>;
}

const MAX_OUTPUT_CHARS = 200_000;
const DEFAULT_TIMEOUT = 360;
const MAX_TIMEOUT = 7200;

function getBgDir(): string {
  const workspace = process.env.AGENT_WORKSPACE || process.cwd();
  return join(workspace, "bg-jobs");
}

export async function execTool(args: ExecArgs): Promise<any> {
  const { command, workdir, timeout = DEFAULT_TIMEOUT, background = false, env } = args;
  const clampedTimeout = Math.min(Math.max(timeout, 1), MAX_TIMEOUT);

  const options: SpawnOptions = {
    shell: true,
    cwd: workdir || process.cwd(),
    env: env ? { ...process.env, ...env } : process.env,
    stdio: ["pipe", "pipe", "pipe"],
  };

  if (background) {
    const child = spawn(command, [], options);
    const sessionId = `bg-${Date.now()}-${child.pid || "nopid"}`;
    const bgDir = getBgDir();

    try {
      mkdirSync(bgDir, { recursive: true });
    } catch {
      return {
        content: [{ type: "text", text: `Error: unable to create bg-jobs directory in ${bgDir}` }],
        isError: true,
      };
    }

    const jobFile = join(bgDir, `${sessionId}.json`);
    const jobData: {
      pid: number | undefined;
      command: string;
      startedAt: string;
      stdout: string;
      stderr: string;
      exitCode: number | null;
      running: boolean;
    } = {
      pid: child.pid,
      command,
      startedAt: new Date().toISOString(),
      stdout: "",
      stderr: "",
      exitCode: null,
      running: true,
    };

    const saveJob = () => {
      try { writeFileSync(jobFile, JSON.stringify(jobData), "utf-8"); } catch { /* ignore */ }
    };

    saveJob();
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (d) => { jobData.stdout += String(d); saveJob(); });
    child.stderr?.on("data", (d) => { jobData.stderr += String(d); saveJob(); });
    child.on("close", (code) => { jobData.exitCode = code; jobData.running = false; saveJob(); });
    child.on("error", (err) => { jobData.running = false; jobData.exitCode = -1; jobData.stderr += `\n[Error: ${err.message}]`; saveJob(); });

    return {
      content: [{ type: "text", text: `Command started in background (sessionId: ${sessionId}, pid: ${child.pid || "N/A"})` }],
    };
  }

  return new Promise((resolve) => {
    const child = spawn(command, [], options);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killed = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      killed = true;
      try { child.kill("SIGTERM"); } catch { try { child.kill(); } catch { /* ignore */ } }
      setTimeout(() => {
        if (!child.killed) { try { child.kill("SIGKILL"); } catch { try { child.kill(); } catch {} } }
      }, 5000);
    }, clampedTimeout * 1000);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (data) => {
      stdout += data;
      if (stdout.length + stderr.length > MAX_OUTPUT_CHARS * 2) {
        stdout = stdout.substring(0, MAX_OUTPUT_CHARS);
        stderr = stderr.substring(0, MAX_OUTPUT_CHARS);
        killed = true;
        try { child.kill(); } catch {}
      }
    });

    child.stderr?.on("data", (data) => {
      stderr += data;
      if (stdout.length + stderr.length > MAX_OUTPUT_CHARS * 2) {
        stdout = stdout.substring(0, MAX_OUTPUT_CHARS);
        stderr = stderr.substring(0, MAX_OUTPUT_CHARS);
        killed = true;
        try { child.kill(); } catch {}
      }
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeoutId);
      if (timedOut) {
        resolve({
          content: [{ type: "text", text: `Timeout after ${clampedTimeout}s\n\nStdout:\n${truncate(stdout)}\n\nStderr:\n${truncate(stderr)}` }],
          isError: true,
        });
        return;
      }
      if (killed) {
        resolve({
          content: [{ type: "text", text: `Excessive output (max ${MAX_OUTPUT_CHARS} chars).\n\nStdout:\n${truncate(stdout)}\n\nStderr:\n${truncate(stderr)}` }],
          isError: true,
        });
        return;
      }
      const output: any[] = [];
      if (stdout) output.push({ type: "text", text: truncate(stdout) });
      if (stderr) output.push({ type: "text", text: `Stderr:\n${truncate(stderr)}` });
      if (output.length === 0) output.push({ type: "text", text: `Completed (exit: ${code}, signal: ${signal || "none"})` });
      resolve({ content: output, isError: code !== 0 && code !== null });
    });

    child.on("error", (error) => {
      clearTimeout(timeoutId);
      resolve({ content: [{ type: "text", text: `Error: ${error.message}` }], isError: true });
    });
  });
}

export async function execPollTool(args: { jobId: string; tail?: number }): Promise<any> {
  const bgDir = getBgDir();
  const jobFile = join(bgDir, `${args.jobId}.json`);
  const tail = args.tail || 100;
  let raw: string;
  try { raw = readFileSync(jobFile, "utf-8"); } catch {
    return { content: [{ type: "text", text: `Job not found: ${args.jobId}` }], isError: true };
  }
  let job: any;
  try { job = JSON.parse(raw); } catch {
    return { content: [{ type: "text", text: `Corrupted job file: ${args.jobId}` }], isError: true };
  }
  const tailStdout = job.stdout ? (job.stdout as string).split("\n").slice(-tail).join("\n") : "(empty)";
  const tailStderr = job.stderr ? (job.stderr as string).split("\n").slice(-tail).join("\n") : "(empty)";
  const status = job.running ? "[STILL RUNNING]" : `[COMPLETED] exitCode: ${job.exitCode}`;
  return {
    content: [{ type: "text", text: `${status}\npid: ${job.pid}\ncommand: ${job.command}\nstartedAt: ${job.startedAt}\n\n--- Stdout (last ${tail} lines) ---\n${tailStdout}\n\n--- Stderr (last ${tail} lines) ---\n${tailStderr}` }],
  };
}

export async function execKillTool(args: { jobId: string }): Promise<any> {
  const bgDir = getBgDir();
  const jobFile = join(bgDir, `${args.jobId}.json`);
  let raw: string;
  try { raw = readFileSync(jobFile, "utf-8"); } catch {
    return { content: [{ type: "text", text: `Job not found: ${args.jobId}` }], isError: true };
  }
  let job: any;
  try { job = JSON.parse(raw); } catch {
    return { content: [{ type: "text", text: `Corrupted job file: ${args.jobId}` }], isError: true };
  }
  if (!job.running) {
    return { content: [{ type: "text", text: `Job ${args.jobId} already terminated (exitCode: ${job.exitCode})` }] };
  }
  try { process.kill(job.pid, "SIGTERM"); } catch {
    try { process.kill(job.pid); } catch (e) {
      return { content: [{ type: "text", text: `Unable to kill pid ${job.pid}: ${String(e)}` }], isError: true };
    }
  }
  return { content: [{ type: "text", text: `SIGTERM sent to pid ${job.pid} (job: ${args.jobId})` }] };
}

export async function execListTool(): Promise<any> {
  const bgDir = getBgDir();
  let entries: string[];
  try {
    entries = (readdirSync(bgDir) as string[]).filter((f) => f.endsWith(".json"));
  } catch {
    return { content: [{ type: "text", text: "No jobs found (bg-jobs/ empty or missing)." }] };
  }
  if (entries.length === 0) {
    return { content: [{ type: "text", text: "No jobs found." }] };
  }
  const rows = entries.map((f) => {
    const jobId = f.replace(".json", "");
    try {
      const job = JSON.parse(readFileSync(join(bgDir, f), "utf-8"));
      const status = job.running ? "[running]" : `[done, exit ${job.exitCode}]`;
      const age = Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000);
      return `${jobId}  ${status}  ${age}s fa  cmd: ${String(job.command).substring(0, 60)}`;
    } catch {
      return `${jobId}  [corrupted file]`;
    }
  });
  return { content: [{ type: "text", text: `Background jobs:\n\n${rows.join("\n")}` }] };
}

export async function execCleanTool(args: { maxAgeHours?: number; all?: boolean }): Promise<any> {
  const bgDir = getBgDir();
  const maxAgeMs = (args.maxAgeHours ?? 24) * 60 * 60 * 1000;
  const deleteAll = args.all === true;
  let entries: string[];
  try {
    entries = (readdirSync(bgDir) as string[]).filter((f) => f.endsWith(".json"));
  } catch {
    return { content: [{ type: "text", text: "No jobs to clean." }] };
  }
  const deleted: string[] = [];
  const skipped: string[] = [];
  for (const f of entries) {
    const filePath = join(bgDir, f);
    try {
      const job = JSON.parse(readFileSync(filePath, "utf-8"));
      const age = Date.now() - new Date(job.startedAt).getTime();
      if (deleteAll || (!job.running && age > maxAgeMs)) {
        unlinkSync(filePath);
        deleted.push(f.replace(".json", ""));
      } else {
        skipped.push(f.replace(".json", ""));
      }
    } catch {
      try { unlinkSync(filePath); deleted.push(f.replace(".json", "")); } catch { /* ignore */ }
    }
  }
  const lines = [`Deleted: ${deleted.length} job(s).`];
  if (deleted.length > 0) lines.push(deleted.map((id) => `  - ${id}`).join("\n"));
  if (skipped.length > 0) lines.push(`Skipped (running or recent): ${skipped.length}`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.substring(0, MAX_OUTPUT_CHARS) + `\n\n[...truncated: ${text.length} chars total]`;
}
