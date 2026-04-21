import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { join, dirname, basename, resolve } from "path";

interface WikiArgs {
  action: "search" | "read" | "write" | "list";
  query?: string;
  path?: string;
  content?: string;
  maxResults?: number;
}

interface WikiPage {
  path: string;
  title: string;
  snippet: string;
  modified: string;
}

function getWikiRoot(workspace: string): string {
  return join(workspace, "wiki");
}

export async function wikiTool(args: WikiArgs, workspace: string): Promise<any> {
  const { action, query, path: pagePath, content, maxResults = 10 } = args;

  switch (action) {
    case "search":
      if (!query) throw new Error("Parameter 'query' required for search");
      return await searchWiki(query, maxResults, workspace);
    case "read":
      if (!pagePath) throw new Error("Parameter 'path' required for read");
      return await readWikiPage(pagePath, workspace);
    case "write":
      if (!pagePath || !content) throw new Error("Parameters 'path' and 'content' required for write");
      return await writeWikiPage(pagePath, content, workspace);
    case "list":
      return await listWikiPages(maxResults, workspace);
    default:
      throw new Error(`Unknown wiki action: ${action}`);
  }
}

async function searchWiki(query: string, maxResults: number, workspace: string): Promise<any> {
  const WIKI_ROOT = getWikiRoot(workspace);
  const results: WikiPage[] = [];
  const lowerQuery = query.toLowerCase();

  try {
    const pages = await findAllPages(WIKI_ROOT);
    for (const pagePath of pages) {
      try {
        const content = await readFile(pagePath, "utf-8");
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes(lowerQuery) || basename(pagePath, ".md").toLowerCase().includes(lowerQuery)) {
          const stats = await stat(pagePath);
          const relativePath = pagePath.replace(WIKI_ROOT, "").replace(/^\//, "");
          const snippet = content.substring(0, 200).replace(/\n/g, " ") + "...";
          results.push({
            path: relativePath,
            title: extractTitle(content) || basename(pagePath, ".md"),
            snippet,
            modified: stats.mtime.toISOString().split("T")[0],
          });
        }
      } catch (e) { /* skip */ }
      if (results.length >= maxResults) break;
    }

    if (results.length === 0) {
      return { content: [{ type: "text", text: `No results found for "${query}" in wiki.` }] };
    }

    const formatted = results.map((r, i) =>
      `${i + 1}. **${r.title}** (${r.path})\n   ${r.snippet}\n   _Modified: ${r.modified}_`
    ).join("\n\n");

    return { content: [{ type: "text", text: `Results for "${query}" (${results.length} found):\n\n${formatted}` }] };
  } catch (error) {
    throw new Error(`Wiki search error: ${(error as Error).message}`);
  }
}

async function readWikiPage(pagePath: string, workspace: string): Promise<any> {
  const WIKI_ROOT = getWikiRoot(workspace);
  const cleanPath = pagePath.endsWith('.md') ? pagePath : pagePath + '.md';
  const fullPath = resolve(WIKI_ROOT, cleanPath);

  if (!fullPath.startsWith(resolve(WIKI_ROOT))) {
    throw new Error("Invalid path: outside wiki");
  }

  try {
    const content = await readFile(fullPath, "utf-8");
    const stats = await stat(fullPath);
    return {
      content: [{
        type: "text",
        text: ` ${cleanPath}\n_Modified: ${stats.mtime.toISOString().split("T")[0]}_\n\n---\n\n${content}`,
      }],
    };
  } catch (error) {
    return { content: [{ type: "text", text: `Page not found: ${cleanPath}` }], isError: true };
  }
}

async function writeWikiPage(pagePath: string, content: string, workspace: string): Promise<any> {
  const WIKI_ROOT = getWikiRoot(workspace);
  const cleanPath = pagePath.endsWith('.md') ? pagePath : pagePath + '.md';
  const fullPath = resolve(WIKI_ROOT, cleanPath);

  if (!fullPath.startsWith(resolve(WIKI_ROOT))) {
    throw new Error("Invalid path: outside wiki");
  }

  try {
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    return { content: [{ type: "text", text: `Page saved: ${cleanPath}` }] };
  } catch (error) {
    throw new Error(`Wiki write error: ${(error as Error).message}`);
  }
}

async function listWikiPages(maxResults: number, workspace: string): Promise<any> {
  const WIKI_ROOT = getWikiRoot(workspace);
  try {
    const pages = await findAllPages(WIKI_ROOT);
    const results: WikiPage[] = [];

    for (const pagePath of pages.slice(0, maxResults)) {
      try {
        const stats = await stat(pagePath);
        const content = await readFile(pagePath, "utf-8");
        const relativePath = pagePath.replace(WIKI_ROOT, "").replace(/^\//, "");
        results.push({
          path: relativePath,
          title: extractTitle(content) || basename(pagePath, ".md"),
          snippet: content.substring(0, 100).replace(/\n/g, " ") + "...",
          modified: stats.mtime.toISOString().split("T")[0],
        });
      } catch (e) { /* skip */ }
    }

    const formatted = results.map((r, i) =>
      `${i + 1}. **${r.title}** (${r.path}) - _${r.modified}_`
    ).join("\n");

    return { content: [{ type: "text", text: `Wiki pages (${results.length}/${pages.length} shown):\n\n${formatted}` }] };
  } catch (error) {
    throw new Error(`Wiki list error: ${(error as Error).message}`);
  }
}

async function findAllPages(dir: string): Promise<string[]> {
  const pages: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        pages.push(...await findAllPages(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        pages.push(fullPath);
      }
    }
  } catch (error) { /* directory might not exist */ }
  return pages;
}

function extractTitle(content: string): string | null {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  const fmMatch = content.match(/^---\s*[\r\n]+[\s\S]*?title:\s*(.+?)[\r\n]+[\s\S]*?---/m);
  if (fmMatch) return fmMatch[1].trim();
  return null;
}
