import { readFile, writeFile, mkdir, readdir, unlink } from "fs/promises";
import { join, resolve, basename } from "path";

interface PlannerArgs {
  action: "create" | "read" | "list" | "update" | "delete" | "next";
  name?: string;
  content?: string;
  answer?: string;
}

function getPlansDir(workspace: string): string {
  return join(workspace, "plans");
}

export async function plannerTool(args: PlannerArgs, workspace: string): Promise<any> {
  const { action, name, content, answer } = args;

  switch (action) {
    case "create":
      if (!name || !content) throw new Error("Parameters 'name' and 'content' required for create");
      return await createPlan(name, content, workspace);
    case "read":
      if (!name) throw new Error("Parameter 'name' required for read");
      return await readPlan(name, workspace);
    case "list":
      return await listPlans(workspace);
    case "update":
      if (!name || !content) throw new Error("Parameters 'name' and 'content' required for update");
      return await updatePlan(name, content, workspace);
    case "delete":
      if (!name) throw new Error("Parameter 'name' required for delete");
      return await deletePlan(name, workspace);
    case "next":
      if (!name) throw new Error("Parameter 'name' required for next");
      return await nextStep(name, answer, workspace);
    default:
      throw new Error(`Unknown planner action: ${action}`);
  }
}

async function createPlan(name: string, content: string, workspace: string): Promise<any> {
  const plansDir = getPlansDir(workspace);
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    throw new Error("Invalid plan name");
  }

  await mkdir(plansDir, { recursive: true });
  await writeFile(filePath, content, "utf-8");

  return { content: [{ type: "text", text: `Plan created: ${name}.md` }] };
}

async function readPlan(name: string, workspace: string): Promise<any> {
  const plansDir = getPlansDir(workspace);
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    throw new Error("Invalid plan name");
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return { content: [{ type: "text", text: content }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Plan not found: ${name}` }], isError: true };
  }
}

async function listPlans(workspace: string): Promise<any> {
  const plansDir = getPlansDir(workspace);
  try {
    const entries = await readdir(plansDir, { withFileTypes: true });
    const plans = entries
      .filter(e => e.isFile() && e.name.endsWith(".md"))
      .map(e => basename(e.name, ".md"));

    if (plans.length === 0) {
      return { content: [{ type: "text", text: "No plans found." }] };
    }

    return { content: [{ type: "text", text: `Plans:\n\n${plans.map((p, i) => `${i + 1}. ${p}`).join("\n")}` }] };
  } catch (error) {
    return { content: [{ type: "text", text: "No plans found." }] };
  }
}

async function updatePlan(name: string, content: string, workspace: string): Promise<any> {
  const plansDir = getPlansDir(workspace);
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    throw new Error("Invalid plan name");
  }

  await writeFile(filePath, content, "utf-8");
  return { content: [{ type: "text", text: `Plan updated: ${name}.md` }] };
}

async function deletePlan(name: string, workspace: string): Promise<any> {
  const plansDir = getPlansDir(workspace);
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    throw new Error("Invalid plan name");
  }

  try {
    await unlink(filePath);
    return { content: [{ type: "text", text: `Plan deleted: ${name}.md` }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Plan not found: ${name}` }], isError: true };
  }
}

async function nextStep(name: string, answer: string | undefined, workspace: string): Promise<any> {
  const plansDir = getPlansDir(workspace);
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    throw new Error("Invalid plan name");
  }

  try {
    const content = await readFile(filePath, "utf-8");

    // Find the first unchecked task
    const uncheckedRegex = /^- \[ \] (.*)$/gm;
    const match = uncheckedRegex.exec(content);

    if (!match) {
      // Check if there are blocking questions
      const questionRegex = /- \[ \] Question for user: (.*)\n(\s*- Option [A-Z]: .*\n)*/;
      const qMatch = content.match(questionRegex);

      if (qMatch && answer) {
        // Record answer and mark question as done
        const updated = content.replace(qMatch[0], `- [x] Question answered: ${qMatch[1]}\n  - Answer: ${answer}`);
        await writeFile(filePath, updated, "utf-8");
        return { content: [{ type: "text", text: `Recorded answer for "${qMatch[1]}"\n\nNext: ${findNextTask(updated)}` }] };
      }

      if (qMatch && !answer) {
        return { content: [{ type: "text", text: `Blocking question: "${qMatch[1]}"\n\nPlease answer with planner action "next" and provide the "answer" parameter.` }] };
      }

      // All done
      const updated = content.replace(/status: active/, "status: completed");
      await writeFile(filePath, updated, "utf-8");
      return { content: [{ type: "text", text: "Plan completed!" }] };
    }

    // Mark the task as done
    const updated = content.replace(match[0], `- [x] ${match[1]}`);
    await writeFile(filePath, updated, "utf-8");

    return { content: [{ type: "text", text: `Completed: ${match[1]}\n\nNext: ${findNextTask(updated)}` }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Plan not found: ${name}` }], isError: true };
  }
}

function findNextTask(content: string): string {
  const uncheckedRegex = /^- \[ \] (.*)$/gm;
  const match = uncheckedRegex.exec(content);
  return match ? match[1] : "No more tasks. Plan complete!";
}
