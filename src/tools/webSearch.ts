// webSearch.ts — Web search via DuckDuckGo Lite (POST)
// DuckDuckGo often blocks bot requests; we use /lite/ with POST + browser headers.

import { LIMITS } from "../utils/truncate.js";
import { wrapWithInstruction, truncateSnippet } from "../utils/resultWrapper.js";

interface WebSearchArgs {
  query: string;
  count?: number;
}

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

const SEARCH_TIMEOUT_MS = 30_000;
const MAX_RESULTS = 10;

// Modern desktop headers — required to avoid DDG CAPTCHA
const DDG_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://lite.duckduckgo.com/",
  "Content-Type": "application/x-www-form-urlencoded",
};

export async function webSearchTool(args: WebSearchArgs): Promise<any> {
  const { query, count = 5 } = args;
  const limit = Math.min(Math.max(count, 1), MAX_RESULTS);

  return await withTimeout(searchDuckDuckGoLite(query, limit), SEARCH_TIMEOUT_MS, "DuckDuckGo search timeout");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<any> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms)
  );
  try {
    return await Promise.race([promise, timeout]);
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}

// ============== DuckDuckGo Lite (via POST) ==============
async function searchDuckDuckGoLite(query: string, count: number): Promise<any> {
  const body = new URLSearchParams({ q: query, kl: "us-en" });

  const response = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: DDG_HEADERS,
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  // Se compare CAPTCHA/anomaly, blocca subito
  if (html.includes("bots use DuckDuckGo") || html.includes("anomaly-modal")) {
    return {
      content: [{ type: "text", text: "Error: DuckDuckGo requested an anti-bot verification (CAPTCHA). Try again in a few minutes." }],
      isError: true,
    };
  }

  const results = parseDuckDuckGoLiteHTML(html, count);

  if (results.length === 0) {
    return {
      content: [{
        type: "text",
        text: wrapWithInstruction(
          `No results found for "${query}".`,
          "Tell the user that no results were found and suggest alternative search terms."
        ),
      }],
    };
  }

  return formatResults(query, results);
}

function parseDuckDuckGoLiteHTML(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  const rows = html.split(/<tr\b[^>]*>/i);

  for (const row of rows) {
    if (results.length >= maxResults) break;

    const linkMatch = row.match(/<a\s+[^>]*rel="nofollow"\s+href="([^"]+)"[^>]*class='result-link'[^>]*>(.*?)<\/a>/i);
    if (!linkMatch) continue;

    const url = linkMatch[1].replace(/^\/\//, "https://");
    const title = stripHtml(linkMatch[2]);

    const snippetMatch = row.match(/<td\s+class='result-snippet'[^>]*>(.*?)<\/td>/is);
    const description = snippetMatch ? stripHtml(snippetMatch[1]) : "No description";

    results.push({ title, url, description });
  }

  return results;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function formatResults(query: string, results: SearchResult[]): any {
  const trimmed = results.map((r) => ({ ...r, description: truncateSnippet(r.description, LIMITS.webSnippet) }));
  const formatted = trimmed
    .map((result, index) => `${index + 1}. **${result.title}**\n   URL: ${result.url}\n   ${result.description}`)
    .join("\n\n");

  return {
    content: [{
      type: "text",
      text: wrapWithInstruction(
        `Results for: "${query}" (via DuckDuckGo, ${results.length} results)\n\n${formatted}`,
        "Summarize the most relevant 2-3 results for the user. Do NOT list all results verbatim. Pick the most relevant ones and describe them briefly in your own words."
      ),
    }],
    structuredContent: {
      engine: "duckduckgo",
      query,
      count: trimmed.length,
      results: trimmed.map((r) => ({ title: r.title, url: r.url, snippet: r.description })),
    },
  };
}
