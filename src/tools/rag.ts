import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { formatError, getPythonPath } from "../utils/helpers.js";
import { LIMITS } from "../utils/truncate.js";
import { wrapWithInstruction, truncateSnippet } from "../utils/resultWrapper.js";

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
        throw new Error(`Unknown RAG action: ${args.action}`);
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

  if (stderr && stderr.includes("Error")) {
    throw new Error(`RAG stderr: ${stderr}`);
  }

  return stdout;
}

async function ragSearch(args: RagArgs): Promise<any> {
  if (!args.collection || !args.query) {
    throw new Error("Required parameters: collection and query for search");
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
    const distance = r.distance !== null ? ` (distance: ${r.distance.toFixed(3)})` : "";
    const meta = r.metadata ? ` [${Object.entries(r.metadata).map(([k, v]) => `${k}=${v}`).join(", ")}]` : "";
    return `${i + 1}. ${truncateSnippet(r.text ?? "", LIMITS.ragChunk)}${distance}${meta}`;
  }).join("\n\n") || "No results found.";

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `RAG search "${args.query}" in "${args.collection}" (${parsed.results?.length || 0} results):\n\n${formatted}`,
        "Summarize the most relevant snippets. Cite by index and distance. Do not paste every chunk verbatim."
      ),
    }],
  };
}

async function ragAdd(args: RagArgs): Promise<any> {
  if (!args.collection || !args.id || !args.text) {
    throw new Error("Required parameters: collection, id and text to add");
  }

  const cmdArgs = ["--collection", args.collection, "--id", args.id, "--text", args.text];
  if (args.metadata) cmdArgs.push("--metadata", args.metadata);

  const result = await runRag("add", cmdArgs);
  const parsed = JSON.parse(result);

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Added to "${parsed.collection}": id=${parsed.id} (total: ${parsed.chunks} documents)`,
        "Acknowledge the add; do not echo the document back."
      ),
    }],
  };
}

async function ragList(args: RagArgs): Promise<any> {
  if (!args.collection) throw new Error("Required parameter: collection");

  const cmdArgs = ["--collection", args.collection, "--limit", String(args.limit || 50)];
  const result = await runRag("list", cmdArgs);
  const parsed = JSON.parse(result);

  const formatted = parsed.documents?.map((d: any, i: number) => {
    const meta = d.metadata ? ` [${Object.entries(d.metadata).map(([k, v]) => `${k}=${v}`).join(", ")}]` : "";
    return `${i + 1}. ${d.id}${meta}`;
  }).join("\n") || "Empty collection.";

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Collection "${parsed.collection}" (${parsed.count} documents):\n\n${formatted}`,
        "List the IDs compactly. Do not paste full metadata verbatim."
      ),
    }],
  };
}

async function ragDelete(args: RagArgs): Promise<any> {
  if (!args.collection || !args.id) throw new Error("Required parameters: collection and id to delete");

  const result = await runRag("delete", ["--collection", args.collection, "--id", args.id]);
  const parsed = JSON.parse(result);

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Deleted from "${parsed.collection}": ${parsed.id}`,
        "Acknowledge the deletion."
      ),
    }],
  };
}

async function ragCollections(): Promise<any> {
  const result = await runRag("collections", []);
  const parsed = JSON.parse(result);

  const formatted = parsed.collections?.map((c: any) => `• ${c.name} (${c.count} documents)`).join("\n") || "No collections.";

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Collections ChromaDB:\n\n${formatted}`,
        "Briefly list collections and counts. The model can pick which to query next."
      ),
    }],
  };
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

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Sessions indexed into RAG:\n\n${stdout}${stderr ? `\nStderr: ${stderr}` : ""}`,
        "Briefly describe what was indexed. If there are errors, surface the first one."
      ),
    }],
  };
}
