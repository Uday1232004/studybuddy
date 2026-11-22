import { GoogleGenAI } from "@google/genai";

const MAX_CHARS = 20000;
const TIMEOUT_MS = 20000;

const MODELS = [
  process.env.GEMINI_MODEL ?? "gemini-3.7-flash",
  process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite",
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

async function askGemini(ai: GoogleGenAI, prompt: string): Promise<string> {
  for (const model of MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({ model, contents: prompt }),
        TIMEOUT_MS
      );
      return response.text ?? "";
    } catch (error) {
      console.error(`Gemini error (model: ${model}):`, error);
    }
  }
  throw new Error("All models failed");
}

export async function POST(request: Request) {
  const body = await request.json();
  const notes: string = body.notes ?? "";

  if (notes.trim() === "") {
    return Response.json({ error: "Notes cannot be empty." }, { status: 400 });
  }
  if (notes.length > MAX_CHARS) {
    return Response.json(
      { error: "Notes are too long. Please paste under 20,000 characters." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Server is missing the API key." }, { status: 500 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a study assistant. Summarize the student's notes below into 5-7 short bullet points in simple language. Reply with ONLY the bullet points, no introduction or closing sentence.\n\nNOTES:\n${notes}`;
    const summary = await askGemini(ai, prompt);
    return Response.json({ summary });
  } catch {
    return Response.json(
      { error: "The AI is busy right now. Please try again in a moment." },
      { status: 502 }
    );
  }
}