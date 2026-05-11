import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { formatError, textResult, getPythonPath } from "../utils/helpers.js";

const execFileAsync = promisify(execFile);

// @ts-ignore — import.meta.url valido in ESM Node16 ma TS lo rifiuta a volte
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RAG_SCRIPT = existsSync(join(__dirname, "rag.py"))
  ? join(__dirname, "rag.py")
  : join(__dirname, "..", "..", "src", "tools", "rag.py");
const SESSION_EXPORT_SCRIPT = existsSync(join(__dirname, "session_export.py"))
  ? join(__dirname, "session_export.py")
  : join(__dirname, "..", "..", "src", "tools", "session_export.py");

interface RagArgs {
  action: "search" | "add" | "list" | "delete" | "collections" | "ingest_sessions";
  collection?: string;
  query?: string;
  id?: string;
  text?: string;
  metadata?: string;
  limit?: number;
  filter?: string;
  folder?: string;
  reindex?: boolean;
}

const RAG_TIMEOUT = 360_000; // 6 min
const RAG_MAX_BUFFER = 5 * 1024 * 1024;
const INGEST_TIMEOUT = 600_000; // 10 min
const INGEST_MAX_BUFFER = 10 * 1024 * 1024;

export async function ragTool(args: RagArgs): Promise<any> {
  try {
    switch (args.action) {
      case "search":
        return await ragSearch(args);
      case "add":
        return await ragAdd(args);
      case "list":
        return await ragList(args);
      case "delete":
        return await ragDelete(args);
      case "collections":
        return await ragCollections();
      case "ingest_sessions":
        return await ragIngestSessions(args);
      default:
        throw new Error(`Azione RAG sconosciuta: ${args.action}`);
    }
  } catch (error) {
    return formatError(error);
  }
}

async function runRag(command: string, args: string[]): Promise<string> {
  const pythonPath = getPythonPath();
  const allArgs = [RAG_SCRIPT, command, ...args];
  const { stdout, stderr } = await execFileAsync(pythonPath, allArgs, {
    timeout: RAG_TIMEOUT,
    maxBuffer: RAG_MAX_BUFFER,
    windowsHide: true,
  });

  if (stderr && stderr.includes("Errore")) {
    throw new Error(`RAG stderr: ${stderr}`);
  }

  return stdout;
}

async function ragSearch(args: RagArgs): Promise<any> {
  if (!args.collection || !args.query) {
    throw new Error("Parametri richiesti: collection e query per la ricerca");
  }

  const cmdArgs = [
    "--collection", args.collection,
    "--query", args.query,
    "--limit", String(args.limit || 5),
  ];
  if (args.filter) cmdArgs.push("--filter", args.filter);

  const result = await runRag("search", cmdArgs);
  const parsed = JSON.parse(result);

  const formatted = parsed.results?.map((r: any, i: number) => {
    const distance = r.distance !== null ? ` (distanza: ${r.distance.toFixed(3)})` : "";
    const meta = r.metadata ? ` [${Object.entries(r.metadata).map(([k, v]) => `${k}=${v}`).join(", ")}]` : "";
    return `${i + 1}. ${r.text?.substring(0, 300)}${r.text?.length > 300 ? "..." : ""}${distance}${meta}`;
  }).join("\n\n") || "Nessun risultato trovato.";

  return textResult(`🔍 Ricerca RAG "${args.query}" in "${args.collection}" (${parsed.results?.length || 0} risultati):\n\n${formatted}`);
}

async function ragAdd(args: RagArgs): Promise<any> {
  if (!args.collection || !args.id || !args.text) {
    throw new Error("Parametri richiesti: collection, id e text per aggiungere");
  }

  const cmdArgs = ["--collection", args.collection, "--id", args.id, "--text", args.text];
  if (args.metadata) cmdArgs.push("--metadata", args.metadata);

  const result = await runRag("add", cmdArgs);
  const parsed = JSON.parse(result);

  return textResult(`✅ Aggiunto a "${parsed.collection}": id=${parsed.id} (totale: ${parsed.chunks} documenti)`);
}

async function ragList(args: RagArgs): Promise<any> {
  if (!args.collection) throw new Error("Parametro richiesto: collection");

  const cmdArgs = ["--collection", args.collection, "--limit", String(args.limit || 50)];
  const result = await runRag("list", cmdArgs);
  const parsed = JSON.parse(result);

  const formatted = parsed.documents?.map((d: any, i: number) => {
    const meta = d.metadata ? ` [${Object.entries(d.metadata).map(([k, v]) => `${k}=${v}`).join(", ")}]` : "";
    return `${i + 1}. ${d.id}${meta}`;
  }).join("\n") || "Collection vuota.";

  return textResult(`📚 Collection "${parsed.collection}" (${parsed.count} documenti):\n\n${formatted}`);
}

async function ragDelete(args: RagArgs): Promise<any> {
  if (!args.collection || !args.id) throw new Error("Parametri richiesti: collection e id per eliminare");

  const result = await runRag("delete", ["--collection", args.collection, "--id", args.id]);
  const parsed = JSON.parse(result);

  return textResult(`🗑️ Eliminato da "${parsed.collection}": ${parsed.id}`);
}

async function ragCollections(): Promise<any> {
  const result = await runRag("collections", []);
  const parsed = JSON.parse(result);

  const formatted = parsed.collections?.map((c: any) => `• ${c.name} (${c.count} documenti)`).join("\n") || "Nessuna collection.";

  return textResult(`📊 Collections ChromaDB:\n\n${formatted}`);
}

async function ragIngestSessions(args: RagArgs): Promise<any> {
  const cmdArgs: string[] = [];
  if (args.folder) cmdArgs.push("--folder", args.folder);
  if (args.reindex) cmdArgs.push("--reindex");

  const pythonPath = getPythonPath();
  const { stdout, stderr } = await execFileAsync(pythonPath, [SESSION_EXPORT_SCRIPT, ...cmdArgs], {
    timeout: INGEST_TIMEOUT,
    maxBuffer: INGEST_MAX_BUFFER,
    windowsHide: true,
  });

  return textResult(`📦 Sessioni importate nel RAG:\n\n${stdout}${stderr ? `\nStderr: ${stderr}` : ""}`);
}
