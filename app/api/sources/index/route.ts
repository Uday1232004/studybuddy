import { createClient } from "../../../../lib/supabase/server";
import { embedTexts } from "../../../../lib/embeddings";
import { consumeUsage, limitMessage } from "../../../../lib/usage-limits";

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_BATCH_PAGES = 10;
const MAX_FILE_PAGES = 2000;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const MIN_BOUNDARY_OFFSET = 650;
const INSERT_BATCH_SIZE = 100;

type SourceChunk = {
  content: string;
  page: number | null;
  chunk_index: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function splitIntoChunks(page: string): string[] {
  const text = page.replace(/\r\n?/g, "\n").trim();
  if (text === "") return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const lineEnd = window.lastIndexOf("\n") + 1;
      const sentenceEnd =
        Math.max(
          window.lastIndexOf(". "),
          window.lastIndexOf("? "),
          window.lastIndexOf("! ")
        ) + 1;
      const boundary = Math.max(lineEnd, sentenceEnd);
      if (boundary >= MIN_BOUNDARY_OFFSET) {
        end = start + boundary;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk !== "") chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const apiKey = process.env.GEMINI_API_KEY;
  return (apiKey ? message.replaceAll(apiKey, "[redacted]") : message)
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(x-goog-api-key\s*[:=]\s*)\S+/gi, "$1[redacted]");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || typeof userId !== "string" || userId === "") {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please send a valid source." }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.sourceId !== "string" ||
    !UUID_PATTERN.test(body.sourceId) ||
    typeof body.name !== "string" ||
    !Array.isArray(body.pages) ||
    body.pages.length === 0 ||
    body.pages.length > MAX_BATCH_PAGES ||
    !body.pages.every((page) => typeof page === "string") ||
    !(body.startPage === null ||
      (typeof body.startPage === "number" &&
        Number.isInteger(body.startPage) &&
        body.startPage >= 1)) ||
    typeof body.first !== "boolean"
  ) {
    return Response.json({ error: "Please send a valid source." }, { status: 400 });
  }

  const name = body.name.trim().slice(0, 120);
  const startPage = body.startPage as number | null;
  if (
    !name ||
    (startPage !== null && startPage + body.pages.length - 1 > MAX_FILE_PAGES)
  ) {
    return Response.json({ error: "Please send a valid source." }, { status: 400 });
  }

  if (body.first) {
    const usage = await consumeUsage(supabase, "pdf_upload");
    if (!usage.ok) {
      if (usage.reason === "error") {
        return Response.json(
          { error: "Could not check your usage. Please try again." },
          { status: 503 }
        );
      }
      return Response.json(
        {
          error: limitMessage("pdf_upload", usage.retryAfterSeconds),
          code: "RATE_LIMIT",
          retryAfterSeconds: usage.retryAfterSeconds,
        },
        { status: 429 }
      );
    }
  }

  const pages = body.pages as string[];
  const chunks: SourceChunk[] = [];
  for (let index = 0; index < pages.length; index++) {
    const pageChunks = splitIntoChunks(pages[index]);
    const pageNumber = startPage === null ? null : startPage + index;
    for (let indexWithinPage = 0; indexWithinPage < pageChunks.length; indexWithinPage++) {
      chunks.push({
        content: pageChunks[indexWithinPage],
        page: pageNumber,
        chunk_index:
          pageNumber === null
            ? indexWithinPage
            : pageNumber * 1000 + indexWithinPage,
      });
    }
  }

  let embeddings: number[][];
  try {
    embeddings =
      chunks.length > 0
        ? await embedTexts(
            chunks.map((chunk) => chunk.content),
            "RETRIEVAL_DOCUMENT"
          )
        : [];
    if (embeddings.length !== chunks.length) {
      throw new Error("Embedding count did not match chunk count.");
    }
  } catch (error) {
    const detail = safeErrorMessage(error);
    console.error("Could not embed source:", detail);
    const isDailyQuota =
      isRecord(error) && error.code === "DAILY_QUOTA";
    const publicMessage =
      isDailyQuota && error instanceof Error
        ? error.message
        : "Could not index this file. Try again.";
    return Response.json(
      {
        error: publicMessage,
        ...(isDailyQuota ? { code: "DAILY_QUOTA" } : {}),
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: isDailyQuota ? 429 : 502 }
    );
  }

  if (request.signal.aborted) {
    return new Response(null, { status: 499 });
  }

  try {
    if (body.first) {
      const { error: deleteError } = await supabase
        .from("source_chunks")
        .delete()
        .eq("user_id", userId)
        .eq("source_id", body.sourceId);
      if (deleteError) throw new Error(deleteError.message);
    }

    for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE) {
      if (request.signal.aborted) {
        return new Response(null, { status: 499 });
      }
      const rows = chunks
        .slice(start, start + INSERT_BATCH_SIZE)
        .map((chunk, offset) => ({
          user_id: userId,
          source_id: body.sourceId,
          source_name: name,
          page: chunk.page,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          embedding: embeddings[start + offset],
        }));
      const { error: insertError } = await supabase
        .from("source_chunks")
        .insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    return Response.json({ chunks: chunks.length });
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error("Could not save source index:", message);
    return Response.json(
      {
        error: "Could not save the index.",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      },
      { status: 500 }
    );
  }
}
