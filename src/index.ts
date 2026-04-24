#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { execTool } from "./tools/exec.js";
import { readTool } from "./tools/read.js";
import { writeTool } from "./tools/write.js";
import { webSearchTool } from "./tools/webSearch.js";
import { wikiTool } from "./tools/wiki.js";
import { plannerTool } from "./tools/planner.js";
import { compactTool } from "./tools/compact.js";
import { ragTool } from "./tools/rag.js";
import { wikiIngestTool } from "./tools/wiki_ingest.js";

// Get workspace from environment or default to current directory
const WORKSPACE = process.env.AGENT_WORKSPACE || process.cwd();

// Definition of available tools
const TOOLS: Tool[] = [
  {
    name: "exec",
    description: "Execute shell commands. Supports timeout, working directory, environment variables, and background execution.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute" },
        workdir: { type: "string", description: "Working directory (optional)" },
        timeout: { type: "number", description: "Timeout in seconds (optional, default 60)" },
        background: { type: "boolean", description: "Run in background (optional)" },
        env: { type: "object", description: "Additional environment variables (optional)" },
      },
      required: ["command"],
    },
  },
  {
    name: "read",
    description: "Read text files or images (jpg, png, gif, webp). Supports offset and limit for large files.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to file" },
        offset: { type: "number", description: "Start line for text files (1-based, optional)" },
        limit: { type: "number", description: "Max lines for text files (optional)" },
      },
      required: ["path"],
    },
  },
  {
    name: "write",
    description: "Write content to a file. Creates parent directories automatically.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "web_search",
    description: "Search the web using DuckDuckGo (free) or Brave API.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        count: { type: "number", description: "Number of results (1-10, default 5)" },
        engine: { type: "string", enum: ["duckduckgo", "brave"], description: "Search engine" },
      },
      required: ["query"],
    },
  },
  {
    name: "wiki",
    description: "Manage the local LLM wiki. Actions: search, read, write, list.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "read", "write", "list"], description: "Action to perform" },
        query: { type: "string", description: "Search query (for search)" },
        path: { type: "string", description: "Page path (for read/write)" },
        content: { type: "string", description: "Markdown content (for write)" },
        maxResults: { type: "number", description: "Max results (optional, default 10)" },
      },
      required: ["action"],
    },
  },
  {
    name: "wiki_ingest",
    description: "Advanced wiki management following the Karpathy LLM Wiki pattern. Actions: ingest (load raw source for processing), query (search wiki), lint (health check), update_index (regenerate index), update_log (append log entry).",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["ingest", "query", "lint", "update_index", "update_log"], description: "Action to perform" },
        source: { type: "string", description: "Source file path (for ingest/update_log)" },
        query_text: { type: "string", description: "Search query text (for query)" },
      },
      required: ["action"],
    },
  },
  {
    name: "rag",
    description: "Semantic search via ChromaDB + nomic embeddings. Actions: search (semantic query), add (add document), add_batch (bulk add), list (list collection), delete (remove doc), collections (list all collections), ingest_sessions (index LM Studio sessions).",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "add", "add_batch", "list", "delete", "collections", "ingest_sessions"], description: "Action to perform" },
        collection: { type: "string", description: "Collection name (required for search/add/list/delete)" },
        query: { type: "string", description: "Search query (for search)" },
        id: { type: "string", description: "Document ID (for add/delete)" },
        text: { type: "string", description: "Document text (for add), or JSON array (for add_batch)" },
        metadata: { type: "string", description: "JSON metadata (for add)" },
        limit: { type: "number", description: "Max results (for search/list, default 5/50)" },
        filter: { type: "string", description: "JSON where filter (for search)" },
        folder: { type: "string", description: "LM Studio sessions folder (for ingest_sessions)" },
        reindex: { type: "boolean", description: "Re-index from scratch (for ingest_sessions)" },
      },
      required: ["action"],
    },
  },
  {
    name: "planner",
    description: "Create and manage phased plans. Actions: create, read, list, update, delete, next.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "read", "list", "update", "delete", "next"], description: "Action" },
        name: { type: "string", description: "Plan name (for create/read/update/delete)" },
        content: { type: "string", description: "Plan markdown content (for create/update)" },
        answer: { type: "string", description: "User answer to a blocking question (for next)" },
      },
      required: ["action"],
    },
  },
  {
    name: "compact",
    description: "Manage memory and session compaction. MEMORY: auto-compacts MEMORY.md when >300 lines. SESSION: compacts an LM Studio session into a summary saved to compacted-sessions/. STATUS: shows memory/session state. LIST: lists compacted sessions.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["memory", "session", "status", "list"], description: "Action: memory=compact MEMORY.md, session=compact LM Studio session, status=show state, list=list compacted sessions" },
        session: { type: "string", description: "Session in 'FolderName/file.conversation.json' format (for action=session)" },
        model: { type: "string", description: "Model to use for summarization (for action=session, default: loaded model)" },
        threshold: { type: "number", description: "Line threshold for memory compaction (default: 300, for action=memory)" },
      },
      required: ["action"],
    },
  },
];

const server = new Server(
  { name: "lm-studio-agent-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "exec":
        return await execTool(args as any, WORKSPACE);
      case "read":
        return await readTool(args as any, WORKSPACE);
      case "write":
        return await writeTool(args as any, WORKSPACE);
      case "web_search":
        return await webSearchTool(args as any);
      case "wiki":
        return await wikiTool(args as any, WORKSPACE);
      case "wiki_ingest":
        return await wikiIngestTool(args as any);
      case "rag":
        return await ragTool(args as any);
      case "planner":
        return await plannerTool(args as any, WORKSPACE);
      case "compact":
        return await compactTool(args as any);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`LM Studio Agent Server started on stdio (workspace: ${WORKSPACE})`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
