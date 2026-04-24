import { execFile } from "child_process";
import { promisify } from "util";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RAG_SCRIPT = join(__dirname, "rag.py");
const SESSION_EXPORT_SCRIPT = join(__dirname, "session_export.py");

interface RagArgs {
  action: "search" | "add" | "add_batch" | "list" | "delete" | "collections" | "ingest_sessions";
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

/**
 * MCP tool for RAG (ChromaDB + nomic embeddings via LM Studio).
 * Actions:
 *  - search: semantic search in a collection
 *  - add: add a document to a collection
 *  - list: list documents in a collection
 *  - delete: remove a document
 *  - collections: list all collections
 *  - ingest_sessions: export and index LM Studio sessions
 */
export async function ragTool(args: RagArgs): Promise<any> {
  const { action } = args;

  try {
    switch (action) {
      case "search":
        return await ragSearch(args);
      case "add":
        return await ragAdd(args);
      case "add_batch":
        return await ragAddBatch(args);
      case "list":
        return await ragList(args);
      case "delete":
        return await ragDelete(args);
      case "collections":
        return await ragCollections();
      case "ingest_sessions":
        return await ragIngestSessions(args);
      default:
        throw new Error(`Unknown RAG action: ${action}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `RAG error: ${errorMessage}` }],
      isError: true,
    };
  }
}

async function runRag(command: string, args: string[]): Promise<string> {
  const allArgs = [RAG_SCRIPT, command, ...args];
  const { stdout, stderr } = await execFileAsync("python3", allArgs, {
    timeout: 60000,
    maxBuffer: 5 * 1024 * 1024,
  });

  if (stderr && stderr.toLowerCase().includes("error")) {
    throw new Error(`RAG stderr: ${stderr}`);
  }

  return stdout;
}

async function ragSearch(args: RagArgs): Promise<any> {
  if (!args.collection || !args.query) {
    throw new Error("Required parameters: collection and query");
  }

  const cmdArgs = [
    "--collection", args.collection,
    "--query", args.query,
    "--limit", String(args.limit || 5),
  ];

  if (args.filter) {
    cmdArgs.push("--filter", args.filter);
  }

  const result = await runRag("search", cmdArgs);
  const parsed = JSON.parse(result);

  // Format for LLM consumption
  const formatted = parsed.results?.map((r: any, i: number) => {
    const distance = r.distance !== null ? ` (distance: ${r.distance.toFixed(3)})` : "";
    const meta = r.metadata ? ` [${Object.entries(r.metadata).map(([k, v]) => `${k}=${v}`).join(", ")}]` : "";
    return `${i + 1}. ${r.text?.substring(0, 300)}${r.text?.length > 300 ? "..." : ""}${distance}${meta}`;
  }).join("\n\n") || "No results found.";

  return {
    content: [{
      type: "text" as const,
      text: `RAG search "${args.query}" in "${args.collection}" (${parsed.results?.length || 0} results):\n\n${formatted}`,
    }],
  };
}

async function ragAdd(args: RagArgs): Promise<any> {
  if (!args.collection || !args.id || !args.text) {
    throw new Error("Required parameters: collection, id and text");
  }

  const cmdArgs = [
    "--collection", args.collection,
    "--id", args.id,
    "--text", args.text,
  ];

  if (args.metadata) {
    cmdArgs.push("--metadata", args.metadata);
  }

  const result = await runRag("add", cmdArgs);
  const parsed = JSON.parse(result);

  return {
    content: [{
      type: "text" as const,
      text: `Added to "${parsed.collection}": id=${parsed.id} (total: ${parsed.chunks} documents)`,
    }],
  };
}

async function ragAddBatch(args: RagArgs): Promise<any> {
  if (!args.collection) {
    throw new Error("Required parameter: collection");
  }

  const cmdArgs = ["--collection", args.collection];
  if (args.text) {
    // inline batch: text is a JSON array string
    const tmpFile = join("/tmp", `rag_batch_${Date.now()}.json`);
    const { writeFile } = await import("fs/promises");
    await writeFile(tmpFile, args.text, "utf-8");
    cmdArgs.push("--file", tmpFile);
  }

  const result = await runRag("add_batch", cmdArgs);
  const parsed = JSON.parse(result);

  return {
    content: [{
      type: "text" as const,
      text: `Batch added to "${parsed.collection}": ${parsed.count} documents (total: ${parsed.total_chunks})`,
    }],
  };
}

async function ragList(args: RagArgs): Promise<any> {
  if (!args.collection) {
    throw new Error("Required parameter: collection");
  }

  const cmdArgs = [
    "--collection", args.collection,
    "--limit", String(args.limit || 50),
  ];

  const result = await runRag("list", cmdArgs);
  const parsed = JSON.parse(result);

  const formatted = parsed.documents?.map((d: any, i: number) => {
    const meta = d.metadata ? ` [${Object.entries(d.metadata).map(([k, v]) => `${k}=${v}`).join(", ")}]` : "";
    return `${i + 1}. ${d.id}${meta}`;
  }).join("\n") || "Collection is empty.";

  return {
    content: [{
      type: "text" as const,
      text: `Collection "${parsed.collection}" (${parsed.count} documents):\n\n${formatted}`,
    }],
  };
}

async function ragDelete(args: RagArgs): Promise<any> {
  if (!args.collection || !args.id) {
    throw new Error("Required parameters: collection and id");
  }

  const result = await runRag("delete", [
    "--collection", args.collection,
    "--id", args.id,
  ]);
  const parsed = JSON.parse(result);

  return {
    content: [{
      type: "text" as const,
      text: `Deleted from "${parsed.collection}": ${parsed.id}`,
    }],
  };
}

async function ragCollections(): Promise<any> {
  const result = await runRag("collections", []);
  const parsed = JSON.parse(result);

  const formatted = parsed.collections?.map((c: any) =>
    `- ${c.name} (${c.count} documents)`
  ).join("\n") || "No collections.";

  return {
    content: [{
      type: "text" as const,
      text: `ChromaDB Collections:\n\n${formatted}`,
    }],
  };
}

async function ragIngestSessions(args: RagArgs): Promise<any> {
  const cmdArgs: string[] = [];
  if (args.folder) {
    cmdArgs.push("--folder", args.folder);
  }
  if (args.reindex) {
    cmdArgs.push("--reindex");
  }

  const { stdout, stderr } = await execFileAsync("python3", [
    SESSION_EXPORT_SCRIPT, ...cmdArgs
  ], {
    timeout: 300000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    content: [{
      type: "text" as const,
      text: `Sessions imported to RAG:\n\n${stdout}${stderr ? `\nStderr: ${stderr}` : ""}`,
    }],
  };
}
