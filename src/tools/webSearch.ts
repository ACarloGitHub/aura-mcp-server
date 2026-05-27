// webSearch.ts — Web search via DuckDuckGo (lite POST) and Brave API
// DuckDuckGo often blocks bot requests; we use /lite/ with POST + browser headers

interface WebSearchArgs {
  query: string;
  count?: number;
  engine?: "brave" | "duckduckgo";
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
  const { query, count = 5, engine = "duckduckgo" } = args;
  const limit = Math.min(Math.max(count, 1), MAX_RESULTS);

  const braveApiKey = process.env.BRAVE_API_KEY;

  if (engine === "brave" && braveApiKey) {
    const result = await withTimeout(searchBrave(query, limit, braveApiKey), SEARCH_TIMEOUT_MS, "Brave search timeout");
    if (!result.isError) return result;
    console.error("Brave search failed, fallback to DuckDuckGo");
  }

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
      content: [{ type: "text", text: `No results found for "${query}".` }],
    };
  }

  return formatResults(query, results, "DuckDuckGo");
}

function parseDuckDuckGoLiteHTML(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG lite: each result = a <tr> block
  // More robust extraction using split on markers
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

// ============== Brave (API key required) ==============
async function searchBrave(query: string, count: number, apiKey: string): Promise<any> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.append("q", query);
  url.searchParams.append("count", String(count));
  url.searchParams.append("offset", "0");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const results: SearchResult[] = (data.web?.results || []).map((r: any) => ({
    title: r.title || "Untitled",
    url: r.url || "",
    description: r.description || "",
  }));

  return formatResults(query, results.slice(0, count), "Brave");
}

// ============== Helper ==============
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

function formatResults(query: string, results: SearchResult[], source: string): any {
  if (results.length === 0) {
    return {
      content: [{ type: "text", text: `No results found for "${query}" on ${source}.` }],
    };
  }

  const formatted = results
    .map((result, index) => `${index + 1}. **${result.title}**\n   URL: ${result.url}\n   ${result.description}`)
    .join("\n\n");

  return {
    content: [{ type: "text", text: `Results for: "${query}" (via ${source}, ${results.length} results)\n\n${formatted}` }],
  };
}
