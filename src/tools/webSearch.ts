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

export async function webSearchTool(args: WebSearchArgs): Promise<any> {
  const { query, count = 5, engine = "duckduckgo" } = args;
  const braveApiKey = process.env.BRAVE_API_KEY;

  if (engine === "brave" && braveApiKey) {
    return await searchBrave(query, count, braveApiKey);
  }

  return await searchDuckDuckGo(query, count);
}

async function searchBrave(query: string, count: number, apiKey: string): Promise<any> {
  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.append("q", query);
    url.searchParams.append("count", Math.min(Math.max(count, 1), 10).toString());

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const data = await response.json();
    const results: SearchResult[] = data.web?.results || [];

    return formatResults(query, results.slice(0, count), "Brave");
  } catch (error) {
    console.error("Brave search failed, falling back to DuckDuckGo:", error);
    return await searchDuckDuckGo(query, count);
  }
}

async function searchDuckDuckGo(query: string, count: number): Promise<any> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const html = await response.text();
    const results = parseDuckDuckGoHTML(html, count);

    if (results.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No results found for "${query}" on DuckDuckGo.`,
        }],
      };
    }

    return formatResults(query, results, "DuckDuckGo");
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Search error: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

function parseDuckDuckGoHTML(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const resultRegex = /<div class="result[^"]*"[^>]*>.*?<\/div>\s*<\/div>/gs;
  const matches = html.match(resultRegex);

  if (!matches) return parseDuckDuckGoAlternative(html, maxResults);

  for (const match of matches.slice(0, maxResults)) {
    const titleMatch = match.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/i);
    const descMatch = match.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/i);

    if (titleMatch) {
      const url = titleMatch[1].replace(/^\/\//, "https://");
      const title = stripHtml(titleMatch[2]);
      const description = descMatch ? stripHtml(descMatch[1]) : "No description";
      results.push({ title, url, description });
    }
  }

  return results;
}

function parseDuckDuckGoAlternative(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkRegex = /<a[^>]*href="\/\/([^"]*)"[^>]*class="[^"]*result[^"]*"[^>]*>(.*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
    results.push({
      title: stripHtml(match[2]),
      url: `https://${match[1]}`,
      description: "URL found in results",
    });
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

function formatResults(query: string, results: SearchResult[], source: string): any {
  if (results.length === 0) {
    return {
      content: [{ type: "text", text: `No results found for "${query}" via ${source}.` }],
    };
  }

  const formatted = results
    .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.description}`)
    .join("\n\n");

  return {
    content: [{
      type: "text",
      text: `Search results for: "${query}" (via ${source})\n\n${formatted}`,
    }],
  };
}
