import { readFile, writeFile, mkdir, readdir, appendFile, stat } from "fs/promises";
import { join, dirname, basename, resolve } from "path";
import { getWorkspaceRoot, formatError } from "../utils/helpers.js";
import { wrapWithInstruction } from "../utils/resultWrapper.js";
import { ragAdd } from "../rag/index.js";

interface WikiIngestArgs {
  action: "ingest" | "query" | "lint" | "update_index" | "update_log" | "ingest_wiki";
  source?: string;
  query_text?: string;
}

function getWikiRoot(): string {
  return resolve(getWorkspaceRoot(), "Wiki");
}

const LOG_PATH = () => join(getWikiRoot(), "wiki", "log.md");
const INDEX_PATH = () => join(getWikiRoot(), "wiki", "index.md");
const TODAY = new Date().toISOString().split("T")[0];

const INGEST_WIKI_SKIP_DIRS = new Set(["raw", "test", "ritest"]);
const INGEST_WIKI_SKIP_FILES = new Set(["index.md", "log.md"]);

export async function wikiIngestTool(args: WikiIngestArgs): Promise<any> {
  try {
    switch (args.action) {
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
      case "ingest_wiki":
        return await wikiIngestToRag();
      default:
        throw new Error(`Unknown wiki_ingest action: ${args.action}`);
    }
  } catch (error) {
    return formatError(error);
  }
}

async function wikiIngest(args: WikiIngestArgs): Promise<any> {
  if (!args.source) throw new Error("Required parameter: source (path of the raw file to process)");

  const wikiRoot = getWikiRoot();
  const sourcePath = args.source.startsWith("/") || /^[A-Za-z]:/.test(args.source)
    ? args.source
    : join(wikiRoot, "raw", args.source);

  let content: string;
  try {
    content = await readFile(sourcePath, "utf-8");
  } catch {
    throw new Error(`File not found: ${sourcePath}`);
  }

  const fileName = basename(sourcePath, sourcePath.endsWith(".txt") ? ".txt" : ".md");

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Content of "${fileName}" loaded (${content.length} characters).\n\n` +
        `Now create wiki pages from this content:\n` +
        `1. Write a summary via wiki(write) to summaries/${fileName}.md\n` +
        `2. Identify concepts and entities, write pages in concepts/ and entities/\n` +
        `3. Add [[cross-links]] between pages\n` +
        `4. Then call wiki_ingest(action=update_index) to rebuild the index\n` +
        `5. Then call wiki_ingest(action=update_log, source="ingested ${fileName}") to log\n\n` +
        `Use wiki(search|read) afterward to query the curated knowledge.`,
        "Process the loaded content per the embedded instructions."
      ),
    }],
  };
}

async function wikiQuery(args: WikiIngestArgs): Promise<any> {
  if (!args.query_text)     throw new Error("Required parameter: query_text");

  let indexContent = "";
  try {
    indexContent = await readFile(INDEX_PATH(), "utf-8");
  } catch {
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          "Index not found. The wiki may be empty.",
          "Acknowledge that the wiki index is missing."
        ),
      }],
    };
  }

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Wiki index loaded. Use wiki search/read to find relevant pages for: "${args.query_text}"\n\n${indexContent.substring(0, 2000)}`,
        "Use the index to locate relevant pages via wiki search/read."
      ),
    }],
  };
}

async function wikiLint(): Promise<any> {
  const issues: string[] = [];
  const pages: string[] = [];
  const wikiRoot = getWikiRoot();

  const essentialFiles = [INDEX_PATH(), LOG_PATH()];
  for (const f of essentialFiles) {
    try {
      await readFile(f, "utf-8");
    } catch {
      issues.push(`MISSING: ${basename(f)}`);
    }
  }

  await collectMarkdownFiles(wikiRoot, pages);

  for (const pagePath of pages) {
    try {
      const content = await readFile(pagePath, "utf-8");
      const relativePath = pagePath.replace(wikiRoot, "").replace(/^[\\\/]/, "");

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
    ? "✅ Wiki is healthy! No issues found."
    : `⚠️ Found ${issues.length} issues:\n\n${issues.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}`;

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Wiki Lint Report\n\n${report}\n\nTotal pages: ${pages.length}`,
        "Briefly summarize the lint findings; if there are issues, group them by severity. Do not paste every issue verbatim."
      ),
    }],
  };
}

async function wikiUpdateIndex(): Promise<any> {
  const pages: { path: string; title: string; type: string }[] = [];
  const wikiRoot = getWikiRoot();

  const categories = ["summaries", "concepts", "entities", "syntheses", "pages/summaries", "pages/concepts", "pages/entities", "pages/syntheses"];

  for (const cat of categories) {
    const catPath = join(wikiRoot, cat);
    try {
      const files = await readdir(catPath);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const fullPath = join(catPath, file);
        try {
          const content = await readFile(fullPath, "utf-8");
          const title = extractTitle(content) || file.replace(".md", "");
          const type = cat.split("/").pop() || cat;
          pages.push({ path: `${cat}/${file}`, title, type: singularType(type) });
        } catch {
          // skip
        }
      }
    } catch {
      // category doesn't exist yet
    }
  }

  const progettiPath = join(wikiRoot, "projects");
  try {
    await scanProjectPages(progettiPath, "projects", pages);
  } catch {
    // no progetti yet
  }

  let indexContent = `# Wiki Index\n\n_Updated: ${TODAY}_\n\n`;

  const grouped: Record<string, typeof pages> = {};
  for (const page of pages) {
    if (!grouped[page.type]) grouped[page.type] = [];
    grouped[page.type].push(page);
  }

  const sortedTypes = Object.keys(grouped).sort();
  for (const type of sortedTypes) {
    indexContent += `## ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n`;
    const typePages = grouped[type].sort((a, b) => a.title.localeCompare(b.title));
    for (const page of typePages) {
      indexContent += `- [[${page.path}|${page.title}]]\n`;
    }
    indexContent += "\n";
  }

  await writeFile(INDEX_PATH(), indexContent, "utf-8");

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Index updated with ${pages.length} pages.`,
        "Confirm the index was rebuilt and note how many pages it covers."
      ),
    }],
  };
}

async function wikiUpdateLog(args: WikiIngestArgs): Promise<any> {
  const entry = args.source || "Generic operation";
  const logEntry = `\n## [${TODAY}] ${entry}\n`;

  try {
    await appendFile(LOG_PATH(), logEntry, "utf-8");
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `Log updated: ${entry}`,
          "Confirm the log entry was added."
        ),
      }],
    };
  } catch {
    const newLog = `# Wiki Log\n\n_Wiki operations_\n${logEntry}`;
    await writeFile(LOG_PATH(), newLog, "utf-8");
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `Log created and updated: ${entry}`,
          "Confirm the new log entry was created."
        ),
      }],
    };
  }
}

function extractTitle(content: string): string | null {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  const frontmatterMatch = content.match(/^---\s*[\r\n]+[\s\S]*?title:\s*(.+?)[\r\n]+[\s\S]*?---/m);
  if (frontmatterMatch) return frontmatterMatch[1].trim();
  return null;
}

function singularType(type: string): string {
  const map: Record<string, string> = {
    summaries: "summary",
    concepts: "concept",
    entities: "entity",
    syntheses: "synthesis",
    projects: "project",
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

async function scanProjectPages(
  dir: string,
  prefix: string,
  pages: { path: string; title: string; type: string }[]
): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await scanProjectPages(fullPath, `${prefix}/${entry.name}`, pages);
      } else if (entry.name.endsWith(".md")) {
        try {
          const content = await readFile(fullPath, "utf-8");
          const title = extractTitle(content) || entry.name.replace(".md", "");
          pages.push({ path: `${prefix}/${entry.name}`, title, type: "project" });
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }
}

interface WikiPageForRag {
  rel: string;
  content: string;
  title: string;
  type: string;
}

async function collectWikiPages(dir: string, base: string, pages: WikiPageForRag[]): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (INGEST_WIKI_SKIP_DIRS.has(entry.name)) continue;
        await collectWikiPages(fullPath, base, pages);
      } else if (entry.name.endsWith(".md") && !INGEST_WIKI_SKIP_FILES.has(entry.name)) {
        try {
          const content = await readFile(fullPath, "utf-8");
          const rel = fullPath.replace(base, "").replace(/^[\\/]/, "").replace(/\\/g, "/");
          pages.push({
            rel,
            content,
            title: extractTitle(content) || entry.name.replace(".md", ""),
            type: wikiPageType(rel),
          });
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }
}

function wikiPageType(rel: string): string {
  const parts = rel.split("/");
  if (parts.length === 1) {
    return parts[0].replace(".md", "") === "agent_rules" ? "rule" : "page";
  }
  return singularType(parts[0]);
}

async function wikiIngestToRag(): Promise<any> {
  const wikiRoot = getWikiRoot();
  const pages: WikiPageForRag[] = [];
  await collectWikiPages(wikiRoot, wikiRoot, pages);

  let indexed = 0;
  const errors: string[] = [];
  for (const page of pages) {
    try {
      await ragAdd({
        collection: "wiki",
        id: page.rel,
        text: page.content,
        metadata: {
          type: page.type,
          title: page.title.slice(0, 200),
          source: "wiki",
        },
      });
      indexed++;
    } catch (e) {
      errors.push(`${page.rel}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const lines = [
    `Wiki pages indexed into RAG collection "wiki": ${indexed}`,
    `Excluded: raw/, test/, ritest/, index.md, log.md (not indexed).`,
  ];
  if (errors.length) {
    lines.push(`Errors (${errors.length}):`);
    lines.push(...errors.slice(0, 10).map((e) => `  - ${e}`));
  }

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        lines.join("\n"),
        "Briefly summarize the ingest result. This fixes the current curated wiki pages into the RAG 'wiki' collection; re-running updates in place (upsert by id)."
      ),
    }],
  };
}
