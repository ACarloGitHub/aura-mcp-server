const DEFAULT_URL = "http://localhost:1234/v1/chat/completions";

export function llmUrl(): string {
  return process.env.AURA_LLM_URL || DEFAULT_URL;
}

export function llmModel(): string | undefined {
  const m = process.env.AURA_LLM_MODEL;
  return m && m.trim() ? m : undefined;
}

export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatCompletion(opts: {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  disableThinking?: boolean;
}): Promise<string> {
  const {
    model,
    messages,
    maxTokens = 2048,
    temperature = 0.3,
    timeoutMs = 180_000,
    disableThinking = true,
  } = opts;

  const base: Record<string, unknown> = { model, messages, max_tokens: maxTokens, temperature };
  const variants: Record<string, unknown>[] = [];
  if (disableThinking) {
    // Reasoning models (e.g. Qwen3) spend the whole budget on "thinking" and return
    // empty content. Requesting the chat template without thinking avoids that.
    variants.push({ ...base, chat_template_kwargs: { enable_thinking: false } });
  }
  variants.push(base);

  const attempts: string[] = [];
  for (const body of variants) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(llmUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      attempts.push(`network: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      attempts.push(`HTTP ${res.status}: ${detail.slice(0, 120)}`);
      continue;
    }
    const data: any = await res.json();
    const msg = data?.choices?.[0]?.message;
    const content = msg?.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    attempts.push(
      `empty content (finish=${data?.choices?.[0]?.finish_reason}, reasoning=${(msg?.reasoning_content || "").length})`
    );
  }

  // Last resort: one attempt with a much larger budget, in case the reasoning
  // consumed the previous token allowance before the final answer.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(llmUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, max_tokens: 8192 }),
      signal: controller.signal,
    });
    if (res.ok) {
      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return content.trim();
      attempts.push(`empty content (finish=${data?.choices?.[0]?.finish_reason})`);
    } else {
      const detail = await res.text().catch(() => "");
      attempts.push(`HTTP ${res.status}: ${detail.slice(0, 120)}`);
    }
  } finally {
    clearTimeout(timer);
  }

  throw new Error(
    `LLM returned empty content (model=${model}). Attempts: ${attempts.join(" | ")}`
  );
}

export async function summarizeTranscript(opts: {
  transcript: string;
  model: string;
  chunkTokens?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const { transcript, model, chunkTokens = 4000, maxOutputTokens = 2048 } = opts;
  const budgetChars = Math.max(1, chunkTokens) * 4;

  const chunks: string[] = [];
  if (transcript.length <= budgetChars) {
    chunks.push(transcript);
  } else {
    const lines = transcript.split("\n");
    let current = "";
    for (const line of lines) {
      if (current && current.length + line.length + 1 > budgetChars) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? `${current}\n${line}` : line;
      }
    }
    if (current) chunks.push(current);
  }

  const summaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const note = chunks.length > 1 ? ` (parte ${i + 1}/${chunks.length})` : "";
    const s = await chatCompletion({
      model,
      maxTokens: chunks.length > 1 ? Math.min(maxOutputTokens, 800) : maxOutputTokens,
      messages: [
        {
          role: "system",
          content:
            "Sei un assistente che produce riassunti densi e fedeli di conversazioni. Nessun preambolo, solo il riassunto.",
        },
        {
          role: "user",
          content:
            `Riepiloga la seguente conversazione${note}. Conserva: obiettivi, decisioni prese, ` +
            `fatti e risultati, scelte e ragioni, punti aperti, dove ci si è fermati. ` +
            `Usa la stessa lingua della conversazione.\n\nCONVERSAZIONE:\n${chunks[i]}`,
        },
      ],
    });
    summaries.push(s);
  }

  if (summaries.length === 1) return summaries[0];

  const merged = summaries.map((s, i) => `## Parte ${i + 1}\n${s}`).join("\n\n");
  return chatCompletion({
    model,
    maxTokens: maxOutputTokens,
    messages: [
      {
        role: "system",
        content: "Fondi questi riassunti parziali in un unico riassunto coeso, completo e senza ridondanza.",
      },
      { role: "user", content: merged },
    ],
  });
}
