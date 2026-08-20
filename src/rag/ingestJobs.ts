export interface IngestJobResult {
  found: number;
  processed: number;
  indexed: number;
  errors: string[];
  exportDir: string;
}

export interface IngestJobState {
  id: string;
  kind: "lmstudio" | "anythingllm";
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt?: string;
  result?: IngestJobResult;
  error?: string;
}

const jobs = new Map<string, IngestJobState>();

export function getIngestJob(id: string): IngestJobState | undefined {
  return jobs.get(id);
}

export function runIngestJob(
  kind: IngestJobState["kind"],
  fn: () => Promise<IngestJobResult>
): string {
  const id = `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const state: IngestJobState = {
    id,
    kind,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, state);

  void (async () => {
    try {
      const result = await fn();
      state.status = "done";
      state.finishedAt = new Date().toISOString();
      state.result = result;
    } catch (e) {
      state.status = "error";
      state.finishedAt = new Date().toISOString();
      state.error = e instanceof Error ? e.message : String(e);
    }
  })();

  return id;
}
