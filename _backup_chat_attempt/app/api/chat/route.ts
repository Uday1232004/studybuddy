import { askLLM } from "../../../lib/llm";
import { buildChatPrompt } from "../../../lib/prompts";

const MAX_NOTES = 20000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please send a valid chat request." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return Response.json({ error: "Please send a valid chat request." }, { status: 400 });
  }

  const notes = body.notes;
  if (typeof notes !== "string" || notes.trim() === "") {
    return Response.json(
      { error: "Please paste your notes before chatting." },
      { status: 400 }
    );
  }
  if (notes.length > MAX_NOTES) {
    return Response.json(
      { error: "Your notes are too long. Please use 20,000 characters or fewer." },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.messages)) {
    return Response.json(
      { error: "Please send a valid conversation." },
      { status: 400 }
    );
  }

  const history: ChatMessage[] = [];
  for (const message of body.messages.slice(-10)) {
    if (
      !isRecord(message) ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      return Response.json(
        { error: "Each message needs a valid role and text." },
        { status: 400 }
      );
    }

    history.push({
      role: message.role,
      content: message.content.slice(0, 2000),
    });
  }

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return Response.json(
      { error: "Your latest message must be from you." },
      { status: 400 }
    );
  }

  try {
    const reply = await askLLM(buildChatPrompt(notes, history), false);
    return Response.json({ reply });
  } catch (error) {
    const rawDetail = error instanceof Error ? error.message : String(error);
    const detail = [
      process.env.LLM_API_KEY,
      process.env.GROQ_API_KEY,
      process.env.GEMINI_API_KEY,
    ]
      .filter((key): key is string => Boolean(key))
      .reduce(
        (message, key) => message.replaceAll(key, "[redacted]"),
        rawDetail
      )
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/((?:api[_-]?key|token|secret)\s*[:=]\s*)\S+/gi, "$1[redacted]")
      .split(/\r?\n/, 1)[0]
      .slice(0, 200);
    console.error(
      "Chat response failed:",
      error instanceof Error ? error.name : "Unknown error"
    );
    return Response.json(
      {
        error: "The teacher could not answer. Try again.",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}
