import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { join, dirname, basename, extname, resolve } from "path";
import { getWorkspaceRoot, textResult, formatError } from "../utils/helpers.js";
import { LIMITS } from "../utils/truncate.js";
import { wrapWithInstruction, truncateSnippet } from "../utils/resultWrapper.js";

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

function getWikiRoot(): string {
  return resolve(getWorkspaceRoot(), "Wiki");
}

export async function wikiTool(args: WikiArgs): Promise<any> {
  const { action, query, path: pagePath, content, maxResults = 10 } = args;

  try {
    switch (action) {
      case "search":
        if (!query) throw new Error("Parameter 'query' required for search");
        return await searchWiki(query, maxResults);
      case "read":
        if (!pagePath) throw new Error("Parameter 'path' required for read");
        return await readWikiPage(pagePath);
      case "write":
        if (!pagePath || !content) throw new Error("Parameters 'path' and 'content' required for write");
        return await writeWikiPage(pagePath, content);
      case "list":
        return await listWikiPages(maxResults);
      default:
        throw new Error(`Unknown wiki action: ${action}`);
    }
  } catch (err) {
    return formatError(err);
  }
}

async function searchWiki(query: string, maxResults: number): Promise<any> {
  const results: WikiPage[] = [];
  const lowerQuery = query.toLowerCase();
  const wikiRoot = getWikiRoot();

  try {
    const pages = await findAllPages(wikiRoot);
    for (const pagePath of pages) {
      try {
        const content = await readFile(pagePath, "utf-8");
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes(lowerQuery) || basename(pagePath, ".md").toLowerCase().includes(lowerQuery)) {
          const stats = await stat(pagePath);
          const relativePath = pagePath.replace(wikiRoot, "").replace(/^[\\\/]/, "");
          const snippet = content.substring(0, 200).replace(/\n/g, " ") + "...";
          results.push({
            path: relativePath,
            title: extractTitle(content) || basename(pagePath, ".md"),
            snippet,
            modified: stats.mtime.toISOString().split("T")[0],
          });
        }
      } catch {
        // skip problematic files
      }
      if (results.length >= maxResults) break;
    }

    if (results.length === 0) {
      return {
        content: [{
          type: "text",
          text: wrapWithInstruction(
            `No results found for "${query}" in the wiki.`,
            "Tell the user no wiki pages matched and suggest alternate search terms."
          ),
        }],
      };
    }

    const formatted = results.map((r) => ({
      ...r,
      snippet: truncateSnippet(r.snippet, LIMITS.wikiSnippet),
    })).map((r, i) =>
      `${i + 1}. **${r.title}** (${r.path})\n   ${r.snippet}\n   _Modified: ${r.modified}_`
    ).join("\n\n");

    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `Results for "${query}" (${results.length} found):\n\n${formatted}`,
          "Report the matching pages briefly. Do NOT paste long snippets verbatim. Just give the user titles, paths, and a one-line summary each."
        ),
      }],
    };
  } catch (error) {
    throw new Error(`Wiki search error: ${(error as Error).message}`);
  }
}

async function readWikiPage(pagePath: string): Promise<any> {
  const cleanPath = pagePath.endsWith(".md") ? pagePath : pagePath + ".md";
  const wikiRoot = getWikiRoot();
  const fullPath = resolve(wikiRoot, cleanPath);

  if (!fullPath.startsWith(wikiRoot)) {
    return formatError(new Error("Invalid path: outside wiki root"));
  }

  try {
    const content = await readFile(fullPath, "utf-8");
    const stats = await stat(fullPath);
    const truncated = truncateSnippet(content, LIMITS.wikiBody);
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `${cleanPath}\n_Modificato: ${stats.mtime.toISOString().split("T")[0]}_\n\n---\n\n${truncated}`,
          "You have the wiki page content. Reference or quote from it as needed; do NOT restate the whole page back to the user."
        ),
      }],
    };
  } catch {
    return {
      content: [{ type: "text", text: `Page not found: ${cleanPath}` }],
      isError: true,
    };
  }
}

async function writeWikiPage(pagePath: string, content: string): Promise<any> {
  const cleanPath = pagePath.endsWith(".md") ? pagePath : pagePath + ".md";
  const wikiRoot = getWikiRoot();
  const fullPath = resolve(wikiRoot, cleanPath);

  if (!fullPath.startsWith(wikiRoot)) {
    return formatError(new Error("Invalid path: outside wiki root"));
  }

  try {
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `Page saved: ${cleanPath}`,
          "Acknowledge the save. Do not echo the saved content back to the user."
        ),
      }],
    };
  } catch (error) {
    throw new Error(`Wiki write error: ${(error as Error).message}`);
  }
}

async function listWikiPages(maxResults: number): Promise<any> {
  const wikiRoot = getWikiRoot();
  try {
    const pages = await findAllPages(wikiRoot);
    const results: WikiPage[] = [];

    for (const pagePath of pages.slice(0, maxResults)) {
      try {
        const stats = await stat(pagePath);
        const content = await readFile(pagePath, "utf-8");
        const relativePath = pagePath.replace(wikiRoot, "").replace(/^[\\\/]/, "");
        results.push({
          path: relativePath,
          title: extractTitle(content) || basename(pagePath, ".md"),
          snippet: truncateSnippet(content.substring(0, 100).replace(/\n/g, " "), LIMITS.wikiSnippet),
          modified: stats.mtime.toISOString().split("T")[0],
        });
      } catch {
        // skip
      }
    }

    const formatted = results.map((r, i) => `${i + 1}. **${r.title}** (${r.path}) - _${r.modified}_`).join("\n");
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `Pages in the wiki (${results.length}/${pages.length} shown):\n\n${formatted}`,
          "Briefly list the wiki pages. Group by relevant category if obvious."
        ),
      }],
      structuredContent: {
        total: pages.length,
        shown: results.length,
        pages: results.map((r) => ({ path: r.path, title: r.title, modified: r.modified })),
      },
    };
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
        const subPages = await findAllPages(fullPath);
        pages.push(...subPages);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        pages.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist
  }
  return pages;
}

function extractTitle(content: string): string | null {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  const frontmatterMatch = content.match(/^---\s*[\r\n]+[\s\S]*?title:\s*(.+?)[\r\n]+[\s\S]*?---/m);
  if (frontmatterMatch) return frontmatterMatch[1].trim();
  return null;
}
