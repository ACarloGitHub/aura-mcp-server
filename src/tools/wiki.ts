import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { join, dirname, basename, extname, resolve } from "path";
import { getWorkspaceRoot, textResult, formatError } from "../utils/helpers.js";

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
        if (!query) throw new Error("Parametro 'query' richiesto per search");
        return await searchWiki(query, maxResults);
      case "read":
        if (!pagePath) throw new Error("Parametro 'path' richiesto per read");
        return await readWikiPage(pagePath);
      case "write":
        if (!pagePath || !content) throw new Error("Parametri 'path' e 'content' richiesti per write");
        return await writeWikiPage(pagePath, content);
      case "list":
        return await listWikiPages(maxResults);
      default:
        throw new Error(`Azione wiki sconosciuta: ${action}`);
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
        // skip file problematici
      }
      if (results.length >= maxResults) break;
    }

    if (results.length === 0) {
      return textResult(`Nessun risultato trovato per "${query}" nella wiki.`);
    }

    const formatted = results.map((r, i) =>
      `${i + 1}. **${r.title}** (${r.path})\n   ${r.snippet}\n   _Modificato: ${r.modified}_`
    ).join("\n\n");

    return textResult(`🔍 Risultati per "${query}" (${results.length} trovati):\n\n${formatted}`);
  } catch (error) {
    throw new Error(`Errore ricerca wiki: ${(error as Error).message}`);
  }
}

async function readWikiPage(pagePath: string): Promise<any> {
  const cleanPath = pagePath.endsWith(".md") ? pagePath : pagePath + ".md";
  const wikiRoot = getWikiRoot();
  const fullPath = resolve(wikiRoot, cleanPath);

  if (!fullPath.startsWith(wikiRoot)) {
    return formatError(new Error("Path non valido: fuori dalla wiki"));
  }

  try {
    const content = await readFile(fullPath, "utf-8");
    const stats = await stat(fullPath);
    return textResult(`📄 ${cleanPath}\n_Modificato: ${stats.mtime.toISOString().split("T")[0]}_\n\n---\n\n${content}`);
  } catch {
    return {
      content: [{ type: "text", text: `Pagina non trovata: ${cleanPath}` }],
      isError: true,
    };
  }
}

async function writeWikiPage(pagePath: string, content: string): Promise<any> {
  const cleanPath = pagePath.endsWith(".md") ? pagePath : pagePath + ".md";
  const wikiRoot = getWikiRoot();
  const fullPath = resolve(wikiRoot, cleanPath);

  if (!fullPath.startsWith(wikiRoot)) {
    return formatError(new Error("Path non valido: fuori dalla wiki"));
  }

  try {
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    return textResult(`✅ Pagina salvata: ${cleanPath}`);
  } catch (error) {
    throw new Error(`Errore scrittura wiki: ${(error as Error).message}`);
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
          snippet: content.substring(0, 100).replace(/\n/g, " ") + "...",
          modified: stats.mtime.toISOString().split("T")[0],
        });
      } catch {
        // skip
      }
    }

    const formatted = results.map((r, i) => `${i + 1}. **${r.title}** (${r.path}) - _${r.modified}_`).join("\n");
    return textResult(`📚 Pagine nella wiki (${results.length}/${pages.length} mostrate):\n\n${formatted}`);
  } catch (error) {
    throw new Error(`Errore elenco wiki: ${(error as Error).message}`);
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
    // Directory potrebbe non esistere
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
