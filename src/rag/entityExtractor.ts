const KNOWN_ENTITIES: Record<string, string[]> = {
  persons: [
    // Add names of people you interact with, e.g.: "Alice", "Bob"
  ],
  projects: [
    "AnythingLLM", "LM Studio", "ChromaDB", "llama.cpp",
    "RAG", "MCP", "nomic-embed-text", "sqlite-vec", "AuraMCP", "Tauri",
  ],
  places: [
    // Add places relevant to you, e.g.: "London", "Berlin"
  ],
  concepts: [
    "local-first", "zero cloud", "privacy", "RAG", "embedding", "LLM",
    "MCP", "persistent memory", "vector", "semantic", "entities", "ingest",
  ],
};

const PATTERNS: { category: string; re: RegExp }[] = Object.entries(KNOWN_ENTITIES).map(
  ([category, items]) => {
    const sorted = [...items].sort((a, b) => b.length - a.length);
    const escaped = sorted.map((i) => i.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return {
      category,
      re: new RegExp(`(?<!\\w)(${escaped.join("|")})(?!\\w)`, "gu"),
    };
  }
);

const YEAR_RE = /\b(19\d{2}|20\d{2})\b/g;

export interface Entities {
  persons: string[];
  projects: string[];
  places: string[];
  key_concepts: string[];
  year: string;
}

export function extractEntities(text: string): Entities {
  const persons = new Set<string>();
  const projects = new Set<string>();
  const places = new Set<string>();
  const keyConcepts: string[] = [];

  for (const { category, re } of PATTERNS) {
    for (const match of text.matchAll(re)) {
      const val = (match[1] ?? "").trim();
      if (!val) continue;
      if (category === "persons") persons.add(val);
      else if (category === "projects") projects.add(val);
      else if (category === "places") places.add(val);
      else if (category === "concepts") {
        if (!keyConcepts.includes(val)) keyConcepts.push(val);
      }
    }
  }

  const years = text.match(YEAR_RE);
  const year = years
    ? years.sort((a, b) => years.filter((y) => y === b).length - years.filter((y) => y === a).length)[0]
    : "";

  return {
    persons: [...persons].sort().slice(0, 15),
    projects: [...projects].sort().slice(0, 10),
    places: [...places].sort().slice(0, 5),
    key_concepts: keyConcepts.slice(0, 5),
    year,
  };
}

export function entitiesToMetadata(text: string): Record<string, string> {
  const e = extractEntities(text);
  const meta: Record<string, string> = {};
  if (e.persons.length) meta.entities_persons = e.persons.join(",");
  if (e.projects.length) meta.entities_projects = e.projects.join(",");
  if (e.places.length) meta.entities_places = e.places.join(",");
  if (e.key_concepts.length) meta.entities_concepts = e.key_concepts.join(",");
  if (e.year) meta.entities_year = e.year;
  return meta;
}
