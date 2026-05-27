import { readFile, writeFile, mkdir, readdir, unlink, stat } from "fs/promises";
import { join, resolve, basename } from "path";
import { getWorkspaceRoot, textResult, formatError } from "../utils/helpers.js";

interface PlannerArgs {
  action: "create" | "read" | "list" | "update" | "delete" | "next" | "status";
  name?: string;
  content?: string;
  answer?: string;
}

function getPlansDir(): string {
  return resolve(getWorkspaceRoot(), "plans");
}

export async function plannerTool(args: PlannerArgs): Promise<any> {
  const { action, name, content, answer } = args;

  try {
    switch (action) {
      case "create":
        if (!name || !content) throw new Error("Parameters 'name' and 'content' required for create");
        return await createPlan(name, content);
      case "read":
        if (!name) throw new Error("Parameter 'name' required for read");
        return await readPlan(name);
      case "list":
        return await listPlans();
      case "update":
        if (!name || !content) throw new Error("Parameters 'name' and 'content' required for update");
        return await updatePlan(name, content);
      case "delete":
        if (!name) throw new Error("Parameter 'name' required for delete");
        return await deletePlan(name);
      case "next":
        if (!name) throw new Error("Parameter 'name' required for next");
        return await nextStep(name, answer);
      case "status":
        if (!name) throw new Error("Parameter 'name' required for status");
        return await planStatus(name);
      default:
        throw new Error(`Unknown planner action: ${action}`);
    }
  } catch (err) {
    return formatError(err);
  }
}

async function createPlan(name: string, content: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Invalid plan name: path traversal attempt"));
  }

  await mkdir(plansDir, { recursive: true });
  await writeFile(filePath, content, "utf-8");

  return textResult(`Plan created: ${name}.md`);
}

async function readPlan(name: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Invalid plan name"));
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return textResult(content);
  } catch {
    return { content: [{ type: "text", text: `Plan not found: ${name}` }], isError: true };
  }
}

async function listPlans(): Promise<any> {
  const plansDir = getPlansDir();
  try {
    const entries = await readdir(plansDir, { withFileTypes: true });
    const plans = entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => basename(e.name, ".md"));

    if (plans.length === 0) return textResult("No plans found.");

    return textResult(`Plans:\n\n${plans.map((p, i) => `${i + 1}. ${p}`).join("\n")}`);
  } catch {
    return textResult("No plans found.");
  }
}

async function updatePlan(name: string, content: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Invalid plan name"));
  }

  await writeFile(filePath, content, "utf-8");
  return textResult(`Plan updated: ${name}.md`);
}

async function deletePlan(name: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Invalid plan name"));
  }

  try {
    await unlink(filePath);
    return textResult(`Plan deleted: ${name}.md`);
  } catch {
    return { content: [{ type: "text", text: `Plan not found: ${name}` }], isError: true };
  }
}

async function nextStep(name: string, answer: string | undefined): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Invalid plan name"));
  }

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return { content: [{ type: "text", text: `Plan not found: ${name}` }], isError: true };
  }

  // Find the first uncompleted task (line by line)
  const lines = content.split("\n");
  let firstUncheckedIndex = -1;
  let firstUncheckedLine = "";

  for (let i = 0; i < lines.length; i++) {
    if (/^- \[ \] (?!Question)/.test(lines[i])) {
      firstUncheckedIndex = i;
      firstUncheckedLine = lines[i];
      break;
    }
  }

  if (firstUncheckedIndex < 0) {
    // No open tasks: look for blocking questions (line by line)
    let questionStartIndex = -1;
    let questionText = "";
    let optionEndIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/^- \[ \] Question(?:\s+for\s+user)?:/i.test(lines[i])) {
        questionStartIndex = i;
        questionText = lines[i].replace(/^- \[ \] Question(?:\s+for\s+user)?:\s*/i, "");
        // Look for following option lines
        let j = i + 1;
        while (j < lines.length && /^\s*- Option [A-Z]:/.test(lines[j])) {
          j++;
        }
        optionEndIndex = j;
        break;
      }
    }

    if (questionStartIndex >= 0 && answer) {
      const blockLines = lines.slice(questionStartIndex, optionEndIndex);
      const block = blockLines.join("\n");
      const replacement = `- [x] Answered question: ${questionText}\n  - Answer: ${answer}`;
      const updated = content.replace(block, replacement);

      try {
        await writeFile(filePath, updated, "utf-8");
      } catch (e) {
        return formatError(new Error(`Error writing plan while recording answer: ${e instanceof Error ? e.message : String(e)}`));
      }

      return textResult(`Answer recorded for "${questionText}"\n\nNext: ${findNextTask(updated)}`);
    }

    if (questionStartIndex >= 0 && !answer) {
      return textResult(`Blocking question: "${questionText}"\n\nAnswer with planner action=next and the answer parameter.`);
    }

    // No question: plan completed
    const finalContent = content.replace(/status: active/, "status: completed");
    try {
      await writeFile(filePath, finalContent, "utf-8");
    } catch (e) {
      return formatError(new Error(`Error writing plan in completed state: ${e instanceof Error ? e.message : String(e)}`));
    }
    return textResult("Plan completed!");
  }

  // Mark the first task as completed
  const taskText = firstUncheckedLine.replace(/^- \[ \] /, "");
  const updated = content.replace(firstUncheckedLine, `- [x] ${taskText}`);

  try {
    await writeFile(filePath, updated, "utf-8");
  } catch (e) {
    return formatError(new Error(`Error writing plan while completing task: ${e instanceof Error ? e.message : String(e)}`));
  }

  return textResult(`Completed: ${taskText}\n\nNext: ${findNextTask(updated)}`);
}

function findNextTask(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    if (/^- \[ \] (?!Question)/.test(line)) {
      return line.replace(/^- \[ \] /, "");
    }
  }
  // Check for question
  for (const line of lines) {
    if (/^- \[ \] Question(?:\s+for\s+user)?:/i.test(line)) {
      return `[QUESTION] ${line.replace(/^- \[ \] Question(?:\s+for\s+user)?:\s*/i, "")}`;
    }
  }
  return "No more tasks. Plan completed!";
}

async function planStatus(name: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Invalid plan name"));
  }

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return { content: [{ type: "text", text: `Plan not found: ${name}` }], isError: true };
  }

  const lines = content.split("\n");
  let total = 0;
  let completed = 0;
  let blockingQuestion: string | null = null;

  for (const line of lines) {
    if (/^- \[[ x]\] /.test(line)) {
      total++;
      if (/^- \[x\] /.test(line)) {
        completed++;
      }
    }
    if (!blockingQuestion && /^- \[ \] Question(?:\s+for\s+user)?:/i.test(line)) {
      blockingQuestion = line.replace(/^- \[ \] Question(?:\s+for\s+user)?:\s*/i, "");
    }
  }

  const remaining = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  let statusText = `Plan: ${name}\n`;
  statusText += `Total tasks: ${total}\n`;
  statusText += `Completed: ${completed}\n`;
  statusText += `Remaining: ${remaining}\n`;
  statusText += `Progress: ${percentage}%\n`;

  if (blockingQuestion) {
    statusText += `\nActive blocking question: "${blockingQuestion}"`;
  }

  return textResult(statusText);
}
