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
        if (!name || !content) throw new Error("Parametri 'name' e 'content' richiesti per create");
        return await createPlan(name, content);
      case "read":
        if (!name) throw new Error("Parametro 'name' richiesto per read");
        return await readPlan(name);
      case "list":
        return await listPlans();
      case "update":
        if (!name || !content) throw new Error("Parametri 'name' e 'content' richiesti per update");
        return await updatePlan(name, content);
      case "delete":
        if (!name) throw new Error("Parametro 'name' richiesto per delete");
        return await deletePlan(name);
      case "next":
        if (!name) throw new Error("Parametro 'name' richiesto per next");
        return await nextStep(name, answer);
      case "status":
        if (!name) throw new Error("Parametro 'name' richiesto per status");
        return await planStatus(name);
      default:
        throw new Error(`Azione planner sconosciuta: ${action}`);
    }
  } catch (err) {
    return formatError(err);
  }
}

async function createPlan(name: string, content: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Nome piano non valido: tentativo di path traversal"));
  }

  await mkdir(plansDir, { recursive: true });
  await writeFile(filePath, content, "utf-8");

  return textResult(`Piano creato: ${name}.md`);
}

async function readPlan(name: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Nome piano non valido"));
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return textResult(content);
  } catch {
    return { content: [{ type: "text", text: `Piano non trovato: ${name}` }], isError: true };
  }
}

async function listPlans(): Promise<any> {
  const plansDir = getPlansDir();
  try {
    const entries = await readdir(plansDir, { withFileTypes: true });
    const plans = entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => basename(e.name, ".md"));

    if (plans.length === 0) return textResult("Nessun piano trovato.");

    return textResult(`Piani:\n\n${plans.map((p, i) => `${i + 1}. ${p}`).join("\n")}`);
  } catch {
    return textResult("Nessun piano trovato.");
  }
}

async function updatePlan(name: string, content: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Nome piano non valido"));
  }

  await writeFile(filePath, content, "utf-8");
  return textResult(`Piano aggiornato: ${name}.md`);
}

async function deletePlan(name: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Nome piano non valido"));
  }

  try {
    await unlink(filePath);
    return textResult(`Piano eliminato: ${name}.md`);
  } catch {
    return { content: [{ type: "text", text: `Piano non trovato: ${name}` }], isError: true };
  }
}

async function nextStep(name: string, answer: string | undefined): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Nome piano non valido"));
  }

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return { content: [{ type: "text", text: `Piano non trovato: ${name}` }], isError: true };
  }

  // Cerca il primo task non completato (riga per riga)
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
    // Nessun task aperto: cerca domande bloccanti (riga per riga)
    let questionStartIndex = -1;
    let questionText = "";
    let optionEndIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/^- \[ \] Question(?:\s+for\s+user)?:/i.test(lines[i])) {
        questionStartIndex = i;
        questionText = lines[i].replace(/^- \[ \] Question(?:\s+for\s+user)?:\s*/i, "");
        // Cerca option lines che seguono
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
      const replacement = `- [x] Domanda risposta: ${questionText}\n  - Risposta: ${answer}`;
      const updated = content.replace(block, replacement);

      try {
        await writeFile(filePath, updated, "utf-8");
      } catch (e) {
        return formatError(new Error(`Errore scrittura piano durante registrazione risposta: ${e instanceof Error ? e.message : String(e)}`));
      }

      return textResult(`Risposta registrata per "${questionText}"\n\nProssimo: ${findNextTask(updated)}`);
    }

    if (questionStartIndex >= 0 && !answer) {
      return textResult(`Domanda bloccante: "${questionText}"\n\nRispondi con planner action=next e il parametro answer.`);
    }

    // Nessuna domanda: piano completato
    const finalContent = content.replace(/status: active/, "status: completato");
    try {
      await writeFile(filePath, finalContent, "utf-8");
    } catch (e) {
      return formatError(new Error(`Errore scrittura piano in stato completato: ${e instanceof Error ? e.message : String(e)}`));
    }
    return textResult("Piano completato!");
  }

  // Marca il primo task come completato
  const taskText = firstUncheckedLine.replace(/^- \[ \] /, "");
  const updated = content.replace(firstUncheckedLine, `- [x] ${taskText}`);

  try {
    await writeFile(filePath, updated, "utf-8");
  } catch (e) {
    return formatError(new Error(`Errore scrittura piano durante completamento task: ${e instanceof Error ? e.message : String(e)}`));
  }

  return textResult(`Completato: ${taskText}\n\nProssimo: ${findNextTask(updated)}`);
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
      return `[DOMANDA] ${line.replace(/^- \[ \] Question(?:\s+for\s+user)?:\s*/i, "")}`;
    }
  }
  return "Nessun altro task. Piano completato!";
}

async function planStatus(name: string): Promise<any> {
  const plansDir = getPlansDir();
  const filePath = resolve(plansDir, `${name}.md`);

  if (!filePath.startsWith(resolve(plansDir))) {
    return formatError(new Error("Nome piano non valido"));
  }

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return { content: [{ type: "text", text: `Piano non trovato: ${name}` }], isError: true };
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

  let statusText = `Piano: ${name}\n`;
  statusText += `Task totali: ${total}\n`;
  statusText += `Completati: ${completed}\n`;
  statusText += `Rimanenti: ${remaining}\n`;
  statusText += `Avanzamento: ${percentage}%\n`;

  if (blockingQuestion) {
    statusText += `\nDomanda bloccante attiva: "${blockingQuestion}"`;
  }

  return textResult(statusText);
}
