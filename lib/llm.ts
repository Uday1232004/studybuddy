import { askGemini } from "./gemini";
import { askOpenAICompatible } from "./openai-compatible";

export async function askLLM(prompt: string, asJson = false): Promise<string> {
  const provider = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();

  if (provider === "gemini") {
    return askGemini(prompt, asJson);
  }

  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY ?? process.env.GROQ_API_KEY;
  const models = [process.env.LLM_MODEL, process.env.LLM_FALLBACK_MODEL].filter(
    (m): m is string => Boolean(m)
  );

  if (!baseUrl || !apiKey || models.length === 0) {
    throw new Error(
      "LLM_BASE_URL, an API key and LLM_MODEL must be set when LLM_PROVIDER is not gemini"
    );
  }

  try {
    return await askOpenAICompatible(prompt, { baseUrl, apiKey, models, asJson });
  } catch (error) {
    console.error(
      `LLM provider "${provider}" failed:`,
      error instanceof Error ? error.message : error
    );

    const canFallBack =
      process.env.LLM_FALLBACK_TO_GEMINI !== "false" &&
      Boolean(process.env.GEMINI_API_KEY);

    if (canFallBack) {
      console.log("Falling back to Gemini");
      return askGemini(prompt, asJson);
    }
    throw error;
  }
}
