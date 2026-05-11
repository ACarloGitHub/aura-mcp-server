import { readFile, writeFile, mkdir, readdir, appendFile, stat } from "fs/promises";
import { join, dirname, basename, resolve } from "path";
import { getWorkspaceRoot, textResult, formatError } from "../utils/helpers.js";

interface WikiIngestArgs {
  action: "ingest" | "query" | "lint" | "update_index" | "update_log";
  source?: string;
  query_text?: string;
}

function getWikiRoot(): string {
  return resolve(getWorkspaceRoot(), "Wiki");
}

const LOG_PATH = () => join(getWikiRoot(), "wiki", "log.md");
const INDEX_PATH = () => join(getWikiRoot(), "wiki", "index.md");
const TODAY = new Date().toISOString().split("T")[0];

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
      default:
        throw new Error(`Azione wiki_ingest sconosciuta: ${args.action}`);
    }
  } catch (error) {
    return formatError(error);
  }
}

async function wikiIngest(args: WikiIngestArgs): Promise<any> {
  if (!args.source) throw new Error("Parametro richiesto: source (percorso del file raw da processare)");

  const wikiRoot = getWikiRoot();
  const sourcePath = args.source.startsWith("/") || /^[A-Za-z]:/.test(args.source)
    ? args.source
    : join(wikiRoot, "raw", args.source);

  let content: string;
  try {
    content = await readFile(sourcePath, "utf-8");
  } catch {
    throw new Error(`File non trovato: ${sourcePath}`);
  }

  const fileName = basename(sourcePath, sourcePath.endsWith(".txt") ? ".txt" : ".md");

  return textResult(
    `📖 Contenuto di "${fileName}" caricato (${content.length} caratteri).\n\n` +
    `Ora devi:\n` +
    `1. Creare un summary in wiki/summaries/${fileName}.md\n` +
    `2. Identificare concetti e creare pagine in wiki/concepts/\n` +
    `3. Identificare entità e creare pagine in wiki/entities/\n` +
    `4. Aggiungere cross-links tra le pagine\n` +
    `5. Aggiornare wiki/index.md\n` +
    `6. Aggiornare wiki/log.md\n\n` +
    `Il contenuto è pronto per la tua analisi.`
  );
}

async function wikiQuery(args: WikiIngestArgs): Promise<any> {
  if (!args.query_text) throw new Error("Parametro richiesto: query_text");

  let indexContent = "";
  try {
    indexContent = await readFile(INDEX_PATH(), "utf-8");
  } catch {
    return textResult("Index non trovato. La wiki potrebbe essere vuota.");
  }

  return textResult(
    `Indice wiki caricato. Usa la wiki search/read per trovare le pagine rilevanti per: "${args.query_text}"\n\n${indexContent.substring(0, 2000)}`
  );
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
      issues.push(`MANCANTE: ${basename(f)}`);
    }
  }

  await collectMarkdownFiles(wikiRoot, pages);

  for (const pagePath of pages) {
    try {
      const content = await readFile(pagePath, "utf-8");
      const relativePath = pagePath.replace(wikiRoot, "").replace(/^[\\\/]/, "");

      if (!content.startsWith("---")) {
        issues.push(`FRONTMATTER MANCANTE: ${relativePath}`);
      }

      if (!content.includes("[[") && !relativePath.includes("index.md") && !relativePath.includes("log.md")) {
        issues.push(`PAGINA ORFANA: ${relativePath}`);
      }

      if (content.startsWith("---") && !content.includes("confidence:")) {
        issues.push(`CONFIDENCE MANCANTE: ${relativePath}`);
      }
    } catch {
      // skip
    }
  }

  const report = issues.length === 0
    ? "✅ Wiki in salute! Nessun problema trovato."
    : `⚠️ Trovati ${issues.length} problemi:\n\n${issues.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}`;

  return textResult(`🔍 Wiki Lint Report\n\n${report}\n\nPagine totali: ${pages.length}`);
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

  const progettiPath = join(wikiRoot, "progetti");
  try {
    await scanProjectPages(progettiPath, "progetti", pages);
  } catch {
    // no progetti yet
  }

  let indexContent = `# Wiki Index\n\n_Aggiornato: ${TODAY}_\n\n`;

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

  return textResult(`📋 Indice aggiornato con ${pages.length} pagine.`);
}

async function wikiUpdateLog(args: WikiIngestArgs): Promise<any> {
  const entry = args.source || "Operazione generica";
  const logEntry = `\n## [${TODAY}] ${entry}\n`;

  try {
    await appendFile(LOG_PATH(), logEntry, "utf-8");
    return textResult(`📝 Log aggiornato: ${entry}`);
  } catch {
    const newLog = `# Wiki Log\n\n_Operazioni sulla wiki_\n${logEntry}`;
    await writeFile(LOG_PATH(), newLog, "utf-8");
    return textResult(`📝 Log creato e aggiornato: ${entry}`);
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
    progetti: "progetto",
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
          pages.push({ path: `${prefix}/${entry.name}`, title, type: "progetto" });
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }
}
