import { GoogleGenAI } from "@google/genai";

const TIMEOUT_MS = 20000;

const MODELS = [
  process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
  process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.7-flash",
];

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
      console.error(`Gemini error (model: ${model}):`, error);
    }
  }
  throw new Error("All models failed");
}