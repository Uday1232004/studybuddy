import { GoogleGenAI } from "@google/genai";

const TIMEOUT_MS = 15000;
const ROUNDS = 2;
const PAUSE_MS = 2000;

const MODELS = [
  process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
  process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.7-flash",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function shortError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 200);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function askGemini(prompt: string, asJson = false): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const ai = new GoogleGenAI({ apiKey });

  for (let round = 1; round <= ROUNDS; round++) {
    for (const model of MODELS) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: prompt,
            config: asJson ? { responseMimeType: "application/json" } : undefined,
          }),
          TIMEOUT_MS
        );
        return response.text ?? "";
      } catch (error) {
        console.error(
          `Gemini error (round ${round}, model: ${model}): ${shortError(error)}`
        );
      }
    }
    if (round < ROUNDS) await sleep(PAUSE_MS);
  }

  throw new Error("All models failed");
}