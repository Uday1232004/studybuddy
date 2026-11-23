import { askLLM } from "../../../../lib/llm";
import {
  ANALYSIS_SYSTEM,
  buildAnalysisPrompt,
  buildPageDigest,
  parseModelJson,
  validateAnalysis,
} from "../../../../lib/analysis";
import { createClient } from "../../../../lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const QUERY_PAGE_SIZE = 1000;
const MAX_PAGES = 600;

type PageChunk = {
  page: number;
  chunk_index: number;
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPageChunk(value: unknown): value is PageChunk {
  return (
    isRecord(value) &&
    typeof value.page === "number" &&
    Number.isInteger(value.page) &&
    typeof value.chunk_index === "number" &&
    Number.isFinite(value.chunk_index) &&
    typeof value.content === "string"
  );
}

function findPdfSource(sources: unknown, sourceName: string) {
  if (!Array.isArray(sources)) return null;
  return (
    sources.find(
      (source) =>
        isRecord(source) &&
        source.type === "pdf" &&
        source.name === sourceName
    ) ?? null
  );
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
    return Response.json({ error: "Please send a valid request." }, { status: 400 });
  }
  if (
    !isRecord(body) ||
    typeof body.examId !== "string" ||
    !UUID_PATTERN.test(body.examId) ||
    typeof body.sourceName !== "string" ||
    body.sourceName.trim() === "" ||
    body.sourceName.length > 300
  ) {
    return Response.json(
      { error: "A valid subject and PDF name are required." },
      { status: 400 }
    );
  }

  const examId = body.examId;
  const sourceName = body.sourceName;

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, chat_id")
    .eq("id", examId)
    .maybeSingle();
  if (examError) {
    return Response.json(
      { error: "Could not load this subject." },
      { status: 500 }
    );
  }
  if (!exam || typeof exam.chat_id !== "string" || exam.chat_id === "") {
    return Response.json(
      { error: "Link a saved chat to this subject first." },
      { status: 404 }
    );
  }

  const { data: chat, error: chatError } = await supabase
    .from("study_kits")
    .select("sources")
    .eq("id", exam.chat_id)
    .maybeSingle();
  if (chatError) {
    return Response.json(
      { error: "Could not load the linked chat." },
      { status: 500 }
    );
  }
  if (!chat) {
    return Response.json(
      { error: "The linked chat was not found." },
      { status: 404 }
    );
  }

  const source = findPdfSource(chat.sources, sourceName);
  if (!source || !isRecord(source)) {
    return Response.json(
      { error: "This PDF was not found in the linked chat." },
      { status: 404 }
    );
  }
  if (
    typeof source.id !== "string" ||
    !UUID_PATTERN.test(source.id) ||
    typeof source.pages !== "number" ||
    !Number.isInteger(source.pages) ||
    source.pages < 1
  ) {
    return Response.json(
      { error: "This PDF has no page text to scan." },
      { status: 422 }
    );
  }

  const pageCount = source.pages;
  if (pageCount > MAX_PAGES) {
    return Response.json(
      { error: "This PDF is too long to scan. Try a PDF with 600 pages or fewer." },
      { status: 413 }
    );
  }

  const chunks: PageChunk[] = [];
  for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("source_chunks")
      .select("page, chunk_index, content")
      .eq("user_id", userId)
      .eq("source_id", source.id)
      .order("page", { ascending: true })
      .order("chunk_index", { ascending: true })
      .range(offset, offset + QUERY_PAGE_SIZE - 1);
    if (error) {
      return Response.json(
        { error: "Could not load this PDF's page text." },
        { status: 500 }
      );
    }

    const rows: unknown = data;
    if (!Array.isArray(rows) || !rows.every(isPageChunk)) {
      return Response.json(
        { error: "This PDF has no page text to scan." },
        { status: 422 }
      );
    }
    chunks.push(...rows);
    if (rows.length < QUERY_PAGE_SIZE) break;
  }

  if (chunks.length === 0) {
    return Response.json(
      { error: "This PDF has no page text to scan." },
      { status: 422 }
    );
  }

  const pageParts = Array.from({ length: pageCount }, () => [] as string[]);
  for (const chunk of chunks) {
    if (chunk.page < 1 || chunk.page > pageCount) {
      return Response.json(
        { error: "This PDF has no page text to scan." },
        { status: 422 }
      );
    }
    pageParts[chunk.page - 1].push(chunk.content);
  }

  const pageTexts = pageParts.map((parts) => parts.join("\n"));
  if (!pageTexts.some((text) => text.trim() !== "")) {
    return Response.json(
      { error: "This PDF has no page text to scan." },
      { status: 422 }
    );
  }

  let analysis;
  try {
    const digest = buildPageDigest(pageTexts);
    const userPrompt = buildAnalysisPrompt(sourceName, pageCount, digest);
    const response = await askLLM(`${ANALYSIS_SYSTEM}\n\n${userPrompt}`, true);
    const raw = parseModelJson(response);
    analysis = validateAnalysis(raw, pageCount);
  } catch (error) {
    const isRateLimited =
      error instanceof Error && /\b429\b|rate.?limit|quota/i.test(error.message);
    return Response.json(
      { error: "The AI is busy, wait a minute and try again." },
      { status: isRateLimited ? 429 : 502 }
    );
  }

  const { error: saveError } = await supabase
    .from("module_analyses")
    .upsert(
      {
        exam_id: examId,
        chat_id: exam.chat_id,
        module_name: sourceName,
        pages: pageCount,
        overall_difficulty: analysis.overallDifficulty,
        summary: analysis.summary,
        topics: analysis.topics,
        model: null,
      },
      { onConflict: "exam_id,module_name" }
    );
  if (saveError) {
    return Response.json(
      { error: "Could not save this analysis." },
      { status: 500 }
    );
  }

  return Response.json({ analysis });
}
