type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents";
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const BETWEEN_REQUESTS_MS = 1500;
const DEFAULT_RETRY_DELAY_MS = 20000;
const MAX_RETRY_DELAY_MS = 65000;
const SERVER_RETRY_DELAY_MS = 2000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class EmbeddingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

type HttpResult = {
  status: number;
  retryAfter: string | null;
  text: string;
};

let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 768 &&
    value.every(
      (item) => typeof item === "number" && Number.isFinite(item)
    )
  );
}

function getApiMessage(data: unknown, fallback: string) {
  if (isRecord(data)) {
    const error = data.error;
    if (isRecord(error) && typeof error.message === "string") {
      return error.message;
    }
    if (typeof error === "string") return error;
    if (typeof data.message === "string") return data.message;
  }
  return fallback.trim() || "Gemini returned an empty error message.";
}

function findRetryDelay(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const delay = findRetryDelay(item);
      if (delay !== undefined) return delay;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (value.retryDelay !== undefined) return value.retryDelay;
  for (const item of Object.values(value)) {
    const delay = findRetryDelay(item);
    if (delay !== undefined) return delay;
  }
  return undefined;
}

function parseDurationMilliseconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value * 1000;
  }
  if (typeof value !== "string") return undefined;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m)?\s*$/i.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "s";
  if (unit === "ms") return amount;
  if (unit === "m") return amount * 60_000;
  return amount * 1000;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function getRetryDelay(
  data: unknown,
  retryAfter: string | null
): number {
  const fromBody = parseDurationMilliseconds(findRetryDelay(data));
  const delay =
    fromBody ?? parseRetryAfter(retryAfter) ?? DEFAULT_RETRY_DELAY_MS;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, delay));
}

function request(body: string, apiKey: string): Promise<HttpResult> {
  const result = requestQueue.then(async () => {
    const wait = nextRequestAt - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body,
      });
      return {
        status: response.status,
        retryAfter: response.headers.get("Retry-After"),
        text: await response.text(),
      };
    } finally {
      nextRequestAt = Date.now() + BETWEEN_REQUESTS_MS;
    }
  });
  requestQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function embedBatch(
  texts: string[],
  taskType: EmbeddingTaskType,
  apiKey: string
): Promise<number[][]> {
  const body = JSON.stringify({
    requests: texts.map((text) => ({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: 768,
    })),
  });

  for (let retry = 0; ; retry++) {
    let response: HttpResult;
    try {
      response = await request(body, apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new EmbeddingError(
        `Gemini embedding request failed: ${message}`,
        "NETWORK_ERROR"
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(response.text);
    } catch {
      data = undefined;
    }

    if (response.status === 401 || response.status === 403) {
      throw new EmbeddingError(
        "The Gemini key was rejected.",
        "GEMINI_KEY_REJECTED",
        response.status
      );
    }

    const message = getApiMessage(data, response.text);
    if (response.status === 429) {
      if (/(?:perday|per[\s_-]+day|daily)/i.test(`${message}\n${response.text}`)) {
        throw new EmbeddingError(
          "The daily Gemini embedding limit is used up. Try again tomorrow, or enable billing for the Gemini key.",
          "DAILY_QUOTA",
          429
        );
      }
      if (retry < MAX_RETRIES) {
        await sleep(getRetryDelay(data, response.retryAfter));
        continue;
      }
      throw new EmbeddingError(`HTTP 429: ${message.slice(0, 200)}`, "HTTP_429", 429);
    }

    if (response.status >= 500 && response.status < 600 && retry < MAX_RETRIES) {
      await sleep(SERVER_RETRY_DELAY_MS);
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new EmbeddingError(
        `HTTP ${response.status}: ${message.slice(0, 200)}`,
        `HTTP_${response.status}`,
        response.status
      );
    }

    if (
      !isRecord(data) ||
      !Array.isArray(data.embeddings) ||
      data.embeddings.length !== texts.length
    ) {
      throw new EmbeddingError(
        "Gemini returned invalid embedding vectors.",
        "INVALID_RESPONSE"
      );
    }

    const vectors: number[][] = [];
    for (const embedding of data.embeddings) {
      if (!isRecord(embedding) || !isNumberVector(embedding.values)) {
        throw new EmbeddingError(
          "Gemini returned invalid embedding vectors.",
          "INVALID_RESPONSE"
        );
      }
      vectors.push(embedding.values);
    }
    return vectors;
  }
}

export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTaskType
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new EmbeddingError(
      "Missing GEMINI_API_KEY for text embeddings.",
      "MISSING_KEY"
    );
  }

  const embeddings: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    embeddings.push(...(await embedBatch(batch, taskType, apiKey)));
  }
  return embeddings;
}
