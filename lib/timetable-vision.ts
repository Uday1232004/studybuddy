import { GoogleGenAI } from "@google/genai";
import { TIMETABLE_PROMPT } from "./timetable";

type TimetableImage = {
  mimeType: string;
  data: string;
};

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export async function readTimetable(
  images: TimetableImage[]
): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Timetable reading is unavailable.");

  const ai = new GoogleGenAI({ apiKey });
  const models = Array.from(
    new Set([
      process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
      process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.7-flash",
    ])
  );
  const parts = [
    { text: TIMETABLE_PROMPT },
    ...images.map((image) => ({
      inlineData: { mimeType: image.mimeType, data: image.data },
    })),
  ];

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json" },
      });
      if (!response.text) continue;
      return JSON.parse(stripCodeFence(response.text)) as unknown;
    } catch {
      continue;
    }
  }

  throw new Error("Could not read the timetable response.");
}
