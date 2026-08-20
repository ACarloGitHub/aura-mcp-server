import { readFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DEFAULT_LMSTUDIO_DIRS = [
  join(homedir(), ".cache", "lm-studio", "conversations"),
  join(homedir(), ".lmstudio", "conversations"),
];

export function conversationsDir(): string {
  if (process.env.LM_STUDIO_CONVERSATIONS_DIR) return process.env.LM_STUDIO_CONVERSATIONS_DIR;
  for (const dir of DEFAULT_LMSTUDIO_DIRS) {
    if (existsSync(dir)) return dir;
  }
  return DEFAULT_LMSTUDIO_DIRS[0];
}

export interface ParsedMessage {
  role: string;
  content: string;
}

export interface ParsedConversation {
  name: string;
  folder: string;
  created_at: number;
  created_timestamp: number;
  model: string;
  preset: string;
  token_count: number;
  system_prompt: string;
  messages: ParsedMessage[];
  filepath: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function parseConversation(filepath: string): Promise<ParsedConversation | null> {
  let raw: string;
  try {
    raw = await readFile(filepath, "utf-8");
  } catch {
    return null;
  }
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const messages: ParsedMessage[] = [];
  const rawMessages: any[] = Array.isArray(data?.messages) ? data.messages : [];

  for (const msg of rawMessages) {
    const versions: any[] = Array.isArray(msg?.versions) ? msg.versions : [];
    if (versions.length === 0) continue;
    const version = versions[versions.length - 1];
    const role = asString(version?.role || version?.type || "unknown");
    let contentText = "";

    if (role === "user") {
      const contents = version?.content;
      const parts: string[] = [];
      if (Array.isArray(contents)) {
        for (const c of contents) {
          if (typeof c === "string") parts.push(c);
          else if (c && typeof c === "object") {
            const t = asString(c.text || c.content);
            if (t) parts.push(t);
          }
        }
      } else if (typeof contents === "string") {
        parts.push(contents);
      }
      contentText = parts.join(" ");
    } else if (role === "assistant") {
      const steps: any[] = Array.isArray(version?.steps) ? version.steps : [];
      const stepTexts: string[] = [];
      steps.forEach((step, idx) => {
        const sc = step?.content;
        if (Array.isArray(sc)) {
          for (const seg of sc) {
            if (seg && typeof seg === "object") {
              const text = asString(seg.text);
              const segType = asString(seg.type);
              const isStructural = !!seg.isStructural;
              if (text && segType !== "thinking" && !isStructural) {
                if (idx === 0 && text.startsWith("Here") && text.slice(0, 50).toLowerCase().includes("thinking process")) {
                  continue;
                }
                stepTexts.push(text);
              }
            } else if (typeof seg === "string" && seg.trim()) {
              stepTexts.push(seg);
            }
          }
        } else if (typeof sc === "string" && sc.trim()) {
          stepTexts.push(sc);
        }
      });
      contentText = stepTexts.join("\n");
    }

    if (contentText.trim()) {
      messages.push({ role, content: contentText.trim() });
    }
  }

  const lastUsedModel = data?.lastUsedModel;
  const modelId =
    lastUsedModel && typeof lastUsedModel === "object"
      ? asString(lastUsedModel.identifier) || "unknown"
      : "unknown";

  const folder = filepath.split(/[\\/]/).slice(-2, -1)[0] || "";
  const createdAt = Number(data?.createdAt) || 0;

  return {
    name: asString(data?.name) || "Untitled",
    folder,
    created_at: createdAt,
    created_timestamp: createdAt,
    model: modelId,
    preset: asString(data?.preset),
    token_count: Number(data?.tokenCount) || 0,
    system_prompt: asString(data?.systemPrompt),
    messages,
    filepath,
  };
}

export async function findConversationFiles(folder?: string): Promise<string[]> {
  const base = conversationsDir();
  if (!existsSync(base)) return [];
  const out: string[] = [];

  async function walk(dir: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let s;
      try {
        s = await stat(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        await walk(full);
      } else if (entry.endsWith(".conversation.json")) {
        out.push(full);
      }
    }
  }

  if (folder) {
    await walk(join(base, folder));
  } else {
    await walk(base);
  }
  return out.sort();
}

export async function findConversationByTitle(
  title: string
): Promise<{ filepath: string; conv: ParsedConversation } | null> {
  const files = await findConversationFiles();
  const needle = title.trim().toLowerCase();
  if (!needle) return null;

  let fallback: { filepath: string; conv: ParsedConversation } | null = null;
  for (const filepath of files) {
    const conv = await parseConversation(filepath);
    if (!conv) continue;
    const name = conv.name.trim().toLowerCase();
    if (name === needle) return { filepath, conv };
    if (!fallback && name.includes(needle)) fallback = { filepath, conv };
  }
  return fallback;
}
