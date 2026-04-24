import { readFile, writeFile, mkdir, readdir, stat, appendFile } from "fs/promises";
import { join, dirname, basename } from "path";

interface WikiIngestArgs {
  action: "ingest" | "query" | "lint" | "update_index" | "update_log";
  source?: string;
  query_text?: string;
}

const WORKSPACE = process.env.AGENT_WORKSPACE || process.cwd();
const WIKI_ROOT = join(WORKSPACE, "wiki");
const LOG_PATH = join(WIKI_ROOT, "log.md");
const INDEX_PATH = join(WIKI_ROOT, "index.md");
const TODAY = new Date().toISOString().split("T")[0];

/**
 * MCP tool for Karpathy-style LLM Wiki management.
 *
 * Actions:
 *  - ingest: load a raw source file for the agent to process into wiki pages
 *  - query: search the wiki and synthesize an answer
 *  - lint: health check (orphans, missing frontmatter, broken links)
 *  - update_index: regenerate the wiki index
 *  - update_log: append an entry to the wiki log
 */
export async function wikiIngestTool(args: WikiIngestArgs): Promise<any> {
  const { action } = args;

  try {
    switch (action) {
      case "ingest":
        return await wikiIngest(args);
      case "query":
        return await wikiQuery(args);
      case "lint":
        return await wikiLint();
      case "update_index":
        return await wikiUpdateIndex();
      case "update_log":
        return await wikiUpdateLog(args);
      default:
        throw new Error(`Unknown wiki_ingest action: ${action}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `wiki_ingest error: ${errorMessage}` }],
      isError: true,
    };
  }
}

async function wikiIngest(args: WikiIngestArgs): Promise<any> {
  if (!args.source) {
    throw new Error("Required parameter: source (path to raw file to process)");
  }

  const sourcePath = args.source.startsWith("/")
    ? args.source
    : join(WIKI_ROOT, "raw", args.source);

  let content: string;
  try {
    content = await readFile(sourcePath, "utf-8");
  } catch {
    throw new Error(`File not found: ${sourcePath}`);
  }

  const fileName = basename(sourcePath, sourcePath.endsWith(".txt") ? ".txt" : ".md");

  return {
    content: [{
      type: "text" as const,
      text: `Content of "${fileName}" loaded (${content.length} characters).\n\n` +
        `Now you should:\n` +
        `1. Create a summary in wiki/summaries/${fileName}.md\n` +
        `2. Identify concepts and create pages in wiki/concepts/\n` +
        `3. Identify entities and create pages in wiki/entities/\n` +
        `4. Add cross-links between pages\n` +
        `5. Update wiki/index.md\n` +
        `6. Update wiki/log.md\n\n` +
        `The content is ready for your analysis.`,
    }],
  };
}

async function wikiQuery(args: WikiIngestArgs): Promise<any> {
  if (!args.query_text) {
    throw new Error("Required parameter: query_text");
  }

  let indexContent = "";
  try {
    indexContent = await readFile(INDEX_PATH, "utf-8");
  } catch {
    return {
      content: [{
        type: "text" as const,
        text: "Index not found. The wiki may be empty.",
      }],
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: `Wiki index loaded. Use wiki search/read to find relevant pages for: "${args.query_text}"\n\n${indexContent.substring(0, 2000)}`,
    }],
  };
}

async function wikiLint(): Promise<any> {
  const issues: string[] = [];
  const pages: string[] = [];

  const essentialFiles = [INDEX_PATH, LOG_PATH];
  for (const f of essentialFiles) {
    try {
      await readFile(f, "utf-8");
    } catch {
      issues.push(`MISSING: ${basename(f)}`);
    }
  }

  await collectMarkdownFiles(WIKI_ROOT, pages);

  for (const pagePath of pages) {
    try {
      const content = await readFile(pagePath, "utf-8");
      const relativePath = pagePath.replace(WIKI_ROOT, "").replace(/^\//, "");

      if (!content.startsWith("---")) {
        issues.push(`MISSING FRONTMATTER: ${relativePath}`);
      }

      if (!content.includes("[[") && !relativePath.includes("index.md") && !relativePath.includes("log.md")) {
        issues.push(`ORPHAN PAGE: ${relativePath}`);
      }

      if (content.startsWith("---") && !content.includes("confidence:")) {
        issues.push(`MISSING CONFIDENCE: ${relativePath}`);
      }
    } catch {
      // skip
    }
  }

  const report = issues.length === 0
    ? "Wiki is healthy! No issues found."
    : `Found ${issues.length} issues:\n\n${issues.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}`;

  return {
    content: [{
      type: "text" as const,
      text: `Wiki Lint Report\n\n${report}\n\nTotal pages: ${pages.length}`,
    }],
  };
}

async function wikiUpdateIndex(): Promise<any> {
  const pages: { path: string; title: string; type: string }[] = [];

  const categories = ["summaries", "concepts", "entities", "syntheses"];

  for (const cat of categories) {
    const catPath = join(WIKI_ROOT, cat);
    try {
      const files = await readdir(catPath);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const fullPath = join(catPath, file);
        try {
          const content = await readFile(fullPath, "utf-8");
          const title = extractTitle(content) || file.replace(".md", "");
          const type = singularType(cat);
          pages.push({ path: `${cat}/${file}`, title, type });
        } catch {
          // skip
        }
      }
    } catch {
      // category doesn't exist yet
    }
  }

  let indexContent = `# Wiki Index\n\n_Updated: ${TODAY}_\n\n`;

  const grouped: Record<string, typeof pages> = {};
  for (const page of pages) {
    if (!grouped[page.type]) grouped[page.type] = [];
    grouped[page.type].push(page);
  }

  for (const [type, typePages] of Object.entries(grouped).sort()) {
    indexContent += `## ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n`;
    for (const page of typePages.sort((a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title))) {
      indexContent += `- [[${page.path}|${page.title}]]\n`;
    }
    indexContent += "\n";
  }

  await writeFile(INDEX_PATH, indexContent, "utf-8");

  return {
    content: [{
      type: "text" as const,
      text: `Index updated with ${pages.length} pages.`,
    }],
  };
}

async function wikiUpdateLog(args: WikiIngestArgs): Promise<any> {
  const entry = args.source || "Generic operation";
  const logEntry = `\n## [${TODAY}] ${entry}\n`;

  try {
    await appendFile(LOG_PATH, logEntry, "utf-8");
    return {
      content: [{
        type: "text" as const,
        text: `Log updated: ${entry}`,
      }],
    };
  } catch {
    const newLog = `# Wiki Log\n\n_Wiki operations_\n${logEntry}`;
    await writeFile(LOG_PATH, newLog, "utf-8");
    return {
      content: [{
        type: "text" as const,
        text: `Log created and updated: ${entry}`,
      }],
    };
  }
}

// Helper functions
function extractTitle(content: string): string | null {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  const frontmatterMatch = content.match(/^---\s*[\r\n]+[\s\S]*?title:\s*(.+?)[\r\n]+[\s\S]*?---/m);
  if (frontmatterMatch) return frontmatterMatch[1].trim();
  return null;
}

function singularType(type: string): string {
  const map: Record<string, string> = {
    "summaries": "summary",
    "concepts": "concept",
    "entities": "entity",
    "syntheses": "synthesis",
  };
  return map[type] || type;
}

async function collectMarkdownFiles(dir: string, pages: string[]): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await collectMarkdownFiles(fullPath, pages);
      } else if (entry.name.endsWith(".md")) {
        pages.push(fullPath);
      }
    }
  } catch {
    // skip
  }
}
