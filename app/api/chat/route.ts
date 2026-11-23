import { embedTexts } from "../../../lib/embeddings";
import { askLLM } from "../../../lib/llm";
import {
  extractCitations,
  type CitationSource,
} from "../../../lib/citations";
import { buildChatPrompt } from "../../../lib/prompts";
import { createClient } from "../../../lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_SOURCE_IDS = 20;
const MAX_NORMAL_CONTEXT_CHARS = 8999;
const MAX_LESSON_CONTEXT_CHARS = 12000;
const QUERY_PAGE_SIZE = 1000;
const CITED_PAGE_CHUNK_LIMIT = 8;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ContextExcerpt = {
  source_id?: string;
  source_name: string;
  page: number | null;
  content: string;
};

type SourceChunk = ContextExcerpt & {
  source_id: string;
  chunk_index: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSourceChunk(value: unknown): value is SourceChunk {
  return (
    isRecord(value) &&
    typeof value.source_id === "string" &&
    typeof value.source_name === "string" &&
    (value.page === null ||
      (typeof value.page === "number" && Number.isFinite(value.page))) &&
    typeof value.chunk_index === "number" &&
    typeof value.content === "string"
  );
}

function isContextExcerpt(value: unknown): value is ContextExcerpt {
  return (
    isRecord(value) &&
    (value.source_id === undefined || typeof value.source_id === "string") &&
    typeof value.source_name === "string" &&
    (value.page === null ||
      (typeof value.page === "number" && Number.isFinite(value.page))) &&
    typeof value.content === "string"
  );
}

function excerptLabel(chunk: ContextExcerpt) {
  return chunk.page === null
    ? `[${chunk.source_name}]`
    : `[${chunk.source_name}, p.${chunk.page}]`;
}

function appendExcerpt(
  context: string,
  chunk: ContextExcerpt,
  maxCharacters: number
) {
  const separator = context === "" ? "" : "\n\n";
  const label = excerptLabel(chunk);
  const remaining = maxCharacters - context.length - separator.length;
  if (remaining <= label.length + 1) return context;

  const excerpt = `${label}\n${chunk.content}`;
  const addition = excerpt.slice(0, remaining);
  return `${context}${separator}${addition}`;
}

async function loadSourceChunks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sourceId: string
): Promise<SourceChunk[]> {
  const chunks: SourceChunk[] = [];
  for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("source_chunks")
      .select("source_id, source_name, page, chunk_index, content")
      .eq("user_id", userId)
      .eq("source_id", sourceId)
      .order("page", { ascending: true })
      .order("chunk_index", { ascending: true })
      .range(offset, offset + QUERY_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    for (const row of rows) {
      if (isSourceChunk(row)) chunks.push(row);
    }
    if (rows.length < QUERY_PAGE_SIZE) return chunks;
  }
}

async function loadCitationSources(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sourceIds: string[]
): Promise<CitationSource[]> {
  const sources = await Promise.all(
    sourceIds.map(async (sourceId) => {
      const { data, error } = await supabase
        .from("source_chunks")
        .select("source_id, source_name, page")
        .eq("user_id", userId)
        .eq("source_id", sourceId)
        .not("page", "is", null)
        .order("page", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (
        !data ||
        typeof data.source_id !== "string" ||
        typeof data.source_name !== "string" ||
        typeof data.page !== "number"
      ) {
        return null;
      }
      return {
        id: data.source_id,
        name: data.source_name,
        pages: data.page,
      };
    })
  );
  return sources.filter(
    (
      source
    ): source is { id: string; name: string; pages: number } =>
      source !== null
  );
}

async function loadCitedPageChunks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  citations: { sourceId: string; page: number }[]
): Promise<SourceChunk[][]> {
  return Promise.all(
    citations.map(async ({ sourceId, page }) => {
      const { data, error } = await supabase
        .from("source_chunks")
        .select("source_id, source_name, page, chunk_index, content")
        .eq("user_id", userId)
        .eq("source_id", sourceId)
        .eq("page", page)
        .order("chunk_index", { ascending: true })
        .limit(CITED_PAGE_CHUNK_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []).filter(isSourceChunk);
    })
  );
}

async function getPreviousAnswerChunks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sourceIds: string[],
  history: ChatMessage[]
): Promise<SourceChunk[][]> {
  const previousAnswer = history
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "assistant")?.content;
  if (
    !previousAnswer ||
    !/(?:\bp{1,2}\s*\.|pages?)\s*\d/i.test(previousAnswer)
  ) {
    return [];
  }

  const citationSources = await loadCitationSources(
    supabase,
    userId,
    sourceIds
  );
  const citations = extractCitations(previousAnswer, citationSources);
  if (citations.length === 0) return [];
  return loadCitedPageChunks(supabase, userId, citations);
}

function orderPageChunksRoundRobin(pageChunks: SourceChunk[][]) {
  const ordered: SourceChunk[] = [];
  const maxChunks = Math.max(0, ...pageChunks.map((chunks) => chunks.length));
  for (let index = 0; index < maxChunks; index++) {
    for (const chunks of pageChunks) {
      if (chunks[index]) ordered.push(chunks[index]);
    }
  }
  return ordered;
}

function appendUniqueExcerpt(
  context: string,
  chunk: ContextExcerpt,
  maxCharacters: number,
  seen: Set<string>
) {
  const key = JSON.stringify([
    chunk.source_id ?? chunk.source_name,
    chunk.page,
    chunk.content,
  ]);
  if (seen.has(key)) return context;

  const nextContext = appendExcerpt(context, chunk, maxCharacters);
  if (nextContext !== context) seen.add(key);
  return nextContext;
}

function buildLessonContext(sources: SourceChunk[][]) {
  const firstChunks = sources.flatMap((source) =>
    source.length > 0 ? [source[0]] : []
  );
  if (firstChunks.length === 0) return "";

  const allFirstChunksContext = firstChunks
    .map((chunk) => `${excerptLabel(chunk)}\n${chunk.content}`)
    .join("\n\n");
  if (allFirstChunksContext.length > MAX_LESSON_CONTEXT_CHARS) {
    const labelCharacters = firstChunks.reduce(
      (total, chunk) => total + excerptLabel(chunk).length + 1,
      0
    );
    const separators = Math.max(0, firstChunks.length - 1) * 2;
    const contentBudget = Math.floor(
      Math.max(
        0,
        MAX_LESSON_CONTEXT_CHARS - labelCharacters - separators
      ) / firstChunks.length
    );
    return firstChunks
      .map(
        (chunk) =>
          `${excerptLabel(chunk)}\n${chunk.content.slice(0, contentBudget)}`
      )
      .join("\n\n");
  }

  let context = allFirstChunksContext;
  const candidates = sources.flatMap((source) => source.slice(1));
  if (candidates.length === 0) return allFirstChunksContext;

  const averageCost =
    candidates.reduce(
      (total, chunk) => total + excerptLabel(chunk).length + chunk.content.length + 3,
      0
    ) / candidates.length;
  const extraCount = Math.min(
    candidates.length,
    Math.floor((MAX_LESSON_CONTEXT_CHARS - context.length) / averageCost)
  );
  if (extraCount === 0) return context;

  const evenlySpaced = Array.from({ length: extraCount }, (_, index) => {
    const candidateIndex = Math.floor(
      ((index + 0.5) * candidates.length) / extraCount
    );
    return candidates[candidateIndex];
  });
  for (const chunk of evenlySpaced) {
    context = appendExcerpt(context, chunk, MAX_LESSON_CONTEXT_CHARS);
  }
  return context;
}

function safeErrorMessage(error: unknown) {
  const rawDetail = error instanceof Error ? error.message : String(error);
  return [
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
    .split(/\r?\n/, 1)[0];
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Please send a valid chat request." },
      { status: 400 }
    );
  }

  if (!isRecord(body)) {
    return Response.json(
      { error: "Please send a valid chat request." },
      { status: 400 }
    );
  }
  if (
    !Array.isArray(body.sourceIds) ||
    body.sourceIds.length === 0 ||
    body.sourceIds.length > MAX_SOURCE_IDS ||
    !body.sourceIds.every(
      (sourceId) =>
        typeof sourceId === "string" && UUID_PATTERN.test(sourceId)
    )
  ) {
    return Response.json(
      { error: "Choose at least one valid source before chatting." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || typeof userId !== "string" || userId === "") {
    return Response.json({ error: "Please log in first." }, { status: 401 });
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

  const lastStudentMessage = history[history.length - 1].content;
  const isStartingLesson = lastStudentMessage === "START_LESSON";
  const sourceIds = [...new Set(body.sourceIds as string[])];

  try {
    let context = "";
    if (isStartingLesson) {
      const sourceChunks: SourceChunk[][] = [];
      for (const sourceId of sourceIds) {
        sourceChunks.push(await loadSourceChunks(supabase, userId, sourceId));
      }
      context = buildLessonContext(sourceChunks);
    } else {
      const studentMessages = history.filter(
        (message) =>
          message.role === "user" && message.content !== "START_LESSON"
      );
      const previousStudentMessage =
        studentMessages.length > 1
          ? studentMessages[studentMessages.length - 2].content
          : "";
      const latestWordCount = lastStudentMessage
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      const hasReferenceWord =
        /\b(?:it|this|that|them|more|again|simpler|example|diagram|figure|picture|image|explain|continue)\b/i.test(
          lastStudentMessage
        );
      const queryText =
        previousStudentMessage !== "" &&
        (latestWordCount < 8 || hasReferenceWord)
          ? `${lastStudentMessage}\n${previousStudentMessage}`
          : lastStudentMessage;
      const [embeddings, citedPageChunks] = await Promise.all([
        embedTexts([queryText], "RETRIEVAL_QUERY"),
        getPreviousAnswerChunks(supabase, userId, sourceIds, history),
      ]);
      const [queryEmbedding] = embeddings;
      const { data, error } = await supabase.rpc("match_chunks", {
        query_embedding: queryEmbedding,
        source_ids: sourceIds,
        match_count: 8,
      });
      if (error) throw new Error(error.message);

      const matches = Array.isArray(data) ? data.filter(isContextExcerpt) : [];
      const seenChunks = new Set<string>();
      for (const citedChunk of orderPageChunksRoundRobin(citedPageChunks)) {
        context = appendUniqueExcerpt(
          context,
          citedChunk,
          MAX_NORMAL_CONTEXT_CHARS,
          seenChunks
        );
      }
      for (const match of matches) {
        context = appendUniqueExcerpt(
          context,
          match,
          MAX_NORMAL_CONTEXT_CHARS,
          seenChunks
        );
      }
    }

    if (context === "") {
      context = "[No content was found in the selected sources.]";
    }

    const reply = await askLLM(buildChatPrompt(context, history), false);
    return Response.json({ reply });
  } catch (error) {
    const safeMessage = safeErrorMessage(error);
    const detail = safeMessage.slice(0, 200);
    console.error("Chat response failed:", safeMessage);
    return Response.json(
      {
        error: "The teacher could not answer. Try again.",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}
