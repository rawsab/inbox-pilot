/**
 * Thin TypeSafe System One client used by the Stage 1 spike and Stage 3 adapter.
 * Endpoint and response shapes must be confirmed against official docs.
 */

export type SystemOneQuestion =
  | { type: "noul"; instructions: string; criteria?: string }
  | {
      type: "choice";
      instructions: string;
      options: string[];
      criteria?: string;
    }
  | { type: "score"; instructions: string; scale: number; criteria?: string };

export type SystemOneRequest = {
  model: string;
  state: unknown;
  questions: Record<string, SystemOneQuestion>;
};

export type SystemOneResponse = {
  answers?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SystemOneClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class SystemOneClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: SystemOneClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.typesafe.ai").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  async systemOne(body: SystemOneRequest): Promise<SystemOneResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/systemone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`systemone_http_${res.status}: ${text.slice(0, 500)}`);
      }
      return (await res.json()) as SystemOneResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}
