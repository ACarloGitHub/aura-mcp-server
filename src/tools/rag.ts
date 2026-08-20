import { ragSearch, ragAdd, ragList, ragDelete, ragCollections } from "../rag/index.js";
import { ingestSessions } from "../rag/sessions.js";
import { anythingllmIngestSessions } from "./anythingllm.js";
import { formatError } from "../utils/helpers.js";
import { LIMITS } from "../utils/truncate.js";
import { wrapWithInstruction, truncateSnippet } from "../utils/resultWrapper.js";

interface RagArgs {
  action: "search" | "add" | "list" | "delete" | "collections" | "ingest_sessions" | "ingest_anythingllm";
  collection?: string;
  query?: string;
  id?: string;
  text?: string;
  metadata?: string;
  limit?: number;
  filter?: string;
  folder?: string;
  reindex?: boolean;
  workspace?: string;
  thread?: string;
}

export async function ragTool(args: RagArgs): Promise<any> {
  try {
    switch (args.action) {
      case "search":
        return await doSearch(args);
      case "add":
        return await doAdd(args);
      case "list":
        return await doList(args);
      case "delete":
        return await doDelete(args);
      case "collections":
        return await doCollections();
      case "ingest_sessions":
        return await doIngest(args);
      case "ingest_anythingllm":
        return await doIngestAnythingLLM(args);
      default:
        throw new Error(`Unknown RAG action: ${args.action}`);
    }
  } catch (error) {
    return formatError(error);
  }
}

async function doSearch(args: RagArgs): Promise<any> {
  if (!args.collection || !args.query) {
    throw new Error("Required parameters: collection and query for search");
  }
  let filter: Record<string, unknown> | undefined;
  if (args.filter) {
    try {
      filter = JSON.parse(args.filter);
    } catch {
      throw new Error("Invalid JSON in filter");
    }
  }

  const { collection, query, results } = await ragSearch({
    collection: args.collection,
    query: args.query,
    limit: args.limit,
    filter,
  });

  const formatted =
    results
      .map((r, i) => {
        const distance = r.distance !== null ? ` (distance: ${r.distance.toFixed(3)})` : "";
        const meta = Object.keys(r.metadata).length
          ? ` [${Object.entries(r.metadata).map(([k, v]) => `${k}=${v}`).join(", ")}]`
          : "";
        return `${i + 1}. ${truncateSnippet(r.content, LIMITS.ragChunk)}${distance}${meta}`;
      })
      .join("\n\n") || "No results found.";

  return {
    content: [
      {
        type: "text",
        text: wrapWithInstruction(
          `RAG search "${query}" in "${collection}" (${results.length} results):\n\n${formatted}`,
          "Summarize the most relevant snippets. Cite by index and distance. Do not paste every chunk verbatim."
        ),
      },
    ],
    structuredContent: {
      collection,
      query,
      count: results.length,
      results: results.map((r) => ({
        text: r.content,
        distance: r.distance ?? null,
        metadata: r.metadata,
      })),
    },
  };
}

async function doAdd(args: RagArgs): Promise<any> {
  if (!args.collection || !args.id || !args.text) {
    throw new Error("Required parameters: collection, id and text to add");
  }
  let metadata: Record<string, unknown> | undefined;
  if (args.metadata) {
    try {
      metadata = JSON.parse(args.metadata);
    } catch {
      throw new Error("Invalid JSON in metadata");
    }
  }

  const result = await ragAdd({
    collection: args.collection,
    id: args.id,
    text: args.text,
    metadata,
  });

  return {
    content: [
      {
        type: "text",
        text: wrapWithInstruction(
          `Added to "${result.collection}": id=${result.doc_id} (${result.chunks} chunk(s))`,
          "Acknowledge the add; do not echo the document back."
        ),
      },
    ],
  };
}

async function doList(args: RagArgs): Promise<any> {
  if (!args.collection) throw new Error("Required parameter: collection");
  const { collection, count, documents } = ragList({
    collection: args.collection,
    limit: args.limit,
  });

  const formatted =
    documents
      .map((d, i) => {
        const chunks = ` (${d.chunks} chunks)`;
        const meta = Object.keys(d.metadata).length
          ? ` [${Object.entries(d.metadata).map(([k, v]) => `${k}=${v}`).join(", ")}]`
          : "";
        return `${i + 1}. ${d.doc_id}${chunks}${meta}`;
      })
      .join("\n") || "Empty collection.";

  return {
    content: [
      {
        type: "text",
        text: wrapWithInstruction(
          `Collection "${collection}" (${count} documents):\n\n${formatted}`,
          "List the IDs compactly. Do not paste full metadata verbatim."
        ),
      },
    ],
  };
}

async function doDelete(args: RagArgs): Promise<any> {
  if (!args.collection || !args.id) throw new Error("Required parameters: collection and id to delete");
  const result = ragDelete({ collection: args.collection, id: args.id });
  return {
    content: [
      {
        type: "text",
        text: wrapWithInstruction(
          `Deleted from "${result.collection}": ${args.id} (${result.deleted} chunk(s) removed)`,
          "Acknowledge the deletion."
        ),
      },
    ],
  };
}

async function doCollections(): Promise<any> {
  const { collections } = ragCollections();
  const formatted =
    collections.map((c) => `• ${c.name} (${c.count} documents)`).join("\n") || "No collections.";
  return {
    content: [
      {
        type: "text",
        text: wrapWithInstruction(
          `RAG collections:\n\n${formatted}`,
          "Briefly list collections and counts. The model can pick which to query next."
        ),
      },
    ],
  };
}

async function doIngest(args: RagArgs): Promise<any> {
  const result = await ingestSessions({
    folder: args.folder,
    reindex: args.reindex,
  });

  const lines = [
    `Sessions found: ${result.found}`,
    `Processed: ${result.processed}`,
    `Indexed into RAG: ${result.indexed}`,
    `Markdown export: ${result.exportDir}`,
  ];
  if (result.errors.length) {
    lines.push(`Errors (${result.errors.length}):`);
    lines.push(...result.errors.slice(0, 10).map((e) => `  - ${e}`));
  }

  return {
    content: [
      {
        type: "text",
        text: wrapWithInstruction(
          lines.join("\n"),
          "Briefly describe what was indexed. If there are errors, surface the first one."
        ),
      },
    ],
  };
}

async function doIngestAnythingLLM(args: RagArgs): Promise<any> {
  const result = await anythingllmIngestSessions({
    workspace: args.workspace,
    thread: args.thread,
  });

  const lines = [
    `AnythingLLM chats found: ${result.found}`,
    `Markdown exported: ${result.exported}`,
    `Indexed into RAG (collection "sessions"): ${result.indexed}`,
    `Export dir: ${result.exportDir}`,
  ];
  if (result.errors.length) {
    lines.push(`Errors (${result.errors.length}):`);
    lines.push(...result.errors.slice(0, 10).map((e) => `  - ${e}`));
  }

  return {
    content: [
      {
        type: "text",
        text: wrapWithInstruction(
          lines.join("\n"),
          "Briefly describe what was indexed. AnythingLLM only: this action reads chats via the AnythingLLM API. If there are errors, surface the first one."
        ),
      },
    ],
  };
}
