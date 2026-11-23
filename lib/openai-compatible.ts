type Options = {
  baseUrl: string;
  apiKey: string;
  models: string[];
  asJson: boolean;
  timeoutMs?: number;
  rounds?: number;
};

type ChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  usage?: { total_tokens?: number };
};

class HttpError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`HTTP ${status}: ${detail}`);
    this.status = status;
  }
}

const TICKS = "`".repeat(3);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function stripFences(text: string): string {
  const t = text.trim();
  if (t.length > 6 && t.startsWith(TICKS) && t.endsWith(TICKS)) {
    return t.slice(3, -3).trim().replace(/^json\s*/i, "").trim();
  }
  return t;
}

async function callOnce(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  asJson: boolean,
  timeoutMs: number,
  useJsonMode: boolean
): Promise<{ text: string; tokens?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
    };
    if (asJson && useJsonMode) {
      body.response_format = { type: "json_object" };
    }
    const effort = process.env.LLM_REASONING_EFFORT;
    if (effort) {
      body.reasoning_effort = effort;
    }

    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new HttpError(response.status, detail);
    }

    const data = (await response.json()) as ChatResponse;
    const text = data.choices?.[0]?.message?.content ?? "";
    if (text.trim() === "") {
      throw new Error("Empty answer from model");
    }
    return { text, tokens: data.usage?.total_tokens };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function askOpenAICompatible(
  prompt: string,
  options: Options
): Promise<string> {
  const { baseUrl, apiKey, models, asJson } = options;
  const timeoutMs = options.timeoutMs ?? 20000;
  const rounds = options.rounds ?? 2;
  let useJsonMode = true;

  for (let round = 1; round <= rounds; round++) {
    for (const model of models) {
      const started = Date.now();
      try {
        const { text, tokens } = await callOnce(
          baseUrl,
          apiKey,
          model,
          prompt,
          asJson,
          timeoutMs,
          useJsonMode
        );
        console.log(
          `LLM ok model=${model} ms=${Date.now() - started} tokens=${tokens ?? "?"}`
        );
        return asJson ? stripFences(text) : text;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `LLM error (round ${round}, model: ${model}): ${message.slice(0, 200)}`
        );

        if (error instanceof HttpError) {
          if (error.status === 401 || error.status === 403) {
            throw error;
          }
          if (
            error.status === 400 &&
            useJsonMode &&
            asJson &&
            /response_format|json/i.test(message)
          ) {
            useJsonMode = false;
          }
        }
      }
    }
    if (round < rounds) {
      await sleep(2000);
    }
  }

  throw new Error("All models failed");
}
