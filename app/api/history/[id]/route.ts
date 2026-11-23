import { createClient } from "../../../../lib/supabase/server";
import { validateHistoryPayload } from "../validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FILE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getHistorySources(value: unknown, userId: string) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((source) => {
    if (
      !isRecord(source) ||
      typeof source.name !== "string" ||
      (source.type !== "pdf" && source.type !== "text") ||
      typeof source.enabled !== "boolean" ||
      (source.pages !== undefined &&
        (typeof source.pages !== "number" ||
          !Number.isFinite(source.pages) ||
          source.pages < 0))
    ) {
      return [];
    }

    const sourceId =
      typeof source.id === "string" && UUID_PATTERN.test(source.id)
        ? source.id
        : null;
    const filePath =
      sourceId &&
      typeof source.filePath === "string" &&
      source.filePath.length <= 200 &&
      FILE_PATH_PATTERN.test(source.filePath) &&
      source.filePath.startsWith(`${userId}/`) &&
      source.filePath.endsWith(`/${sourceId}.pdf`)
        ? source.filePath
        : null;
    const metadata = {
      name: source.name,
      type: source.type,
      text: "",
      enabled: source.enabled,
      filePath,
      fileSize:
        typeof source.fileSize === "number" &&
        Number.isFinite(source.fileSize) &&
        source.fileSize >= 0
          ? source.fileSize
          : 0,
      ...(typeof source.pages === "number" ? { pages: source.pages } : {}),
    };
    return sourceId
      ? [{ ...metadata, id: sourceId }]
      : [metadata];
  });
}

async function getSignedInUserId() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;

  if (error || typeof userId !== "string" || userId === "") {
    return { supabase, userId: null };
  }

  return { supabase, userId };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id || !UUID_PATTERN.test(id)) {
    return Response.json({ error: "Invalid history item ID." }, { status: 400 });
  }

  const { supabase, userId } = await getSignedInUserId();
  if (!userId) {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("study_kits")
    .select("id, title, sources, messages, notes")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Could not load study history item:", error);
    return Response.json(
      { error: "Could not load this chat. Please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return Response.json({ error: "This chat was not found." }, { status: 404 });
  }

  return Response.json({
    id: data.id,
    title: data.title,
    sources: getHistorySources(data.sources, userId),
    messages: data.messages ?? [],
    notes: data.notes ?? "",
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id || !UUID_PATTERN.test(id)) {
    return Response.json({ error: "Invalid history item ID." }, { status: 400 });
  }

  const { supabase, userId } = await getSignedInUserId();
  if (!userId) {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please send a valid chat." }, { status: 400 });
  }

  const result = validateHistoryPayload(body, userId);
  if (!result.payload) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("study_kits")
    .update({
      title: result.payload.title,
      sources: result.payload.sources,
      messages: result.payload.messages,
      notes: result.payload.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Could not update study history item:", error);
    return Response.json(
      { error: "Could not save this chat. Please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return Response.json({ error: "This chat was not found." }, { status: 404 });
  }

  return Response.json({ id: data.id });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id || !UUID_PATTERN.test(id)) {
    return Response.json({ error: "Invalid history item ID." }, { status: 400 });
  }

  const { supabase, userId } = await getSignedInUserId();
  if (!userId) {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }

  const { data: historyItem, error: readError } = await supabase
    .from("study_kits")
    .select("sources")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("Could not read source metadata before deleting chat.");
  }

  const { data, error } = await supabase
    .from("study_kits")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Could not delete study history item:", error);
    return Response.json(
      { error: "Could not delete this chat. Please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return Response.json({ error: "This chat was not found." }, { status: 404 });
  }

  const cleanupSources = Array.isArray(historyItem?.sources)
    ? historyItem.sources.flatMap((source) => {
        if (
          !isRecord(source) ||
          typeof source.id !== "string" ||
          !UUID_PATTERN.test(source.id)
        ) {
          return [];
        }

        const sourceId = source.id;
        const filePath = source.filePath;
        return [
          {
            id: sourceId,
            filePath:
              typeof filePath === "string" &&
              filePath.length <= 200 &&
              FILE_PATH_PATTERN.test(filePath) &&
              filePath.startsWith(`${userId}/`) &&
              filePath.endsWith(`/${sourceId}.pdf`)
                ? filePath
                : null,
          },
        ];
      })
    : [];
  const sourceIds = cleanupSources.map((source) => source.id);
  const filePaths = cleanupSources.flatMap((source) =>
    source.filePath ? [source.filePath] : []
  );
  const cleanupTasks: Promise<unknown>[] = [];
  if (filePaths.length > 0) {
    cleanupTasks.push(
      (async () => {
        const { error } = await supabase.storage.from("pdfs").remove(filePaths);
        if (error) throw error;
      })()
    );
  }
  if (sourceIds.length > 0) {
    cleanupTasks.push(
      (async () => {
        const { error } = await supabase
          .from("source_chunks")
          .delete()
          .eq("user_id", userId)
          .in("source_id", sourceIds);
        if (error) throw error;
      })()
    );
  }
  const cleanupResults = await Promise.allSettled(cleanupTasks);
  cleanupResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        index === 0 && filePaths.length > 0
          ? "Could not remove stored chat PDFs."
          : "Could not remove chat source chunks."
      );
    }
  });

  return Response.json({ id: data.id });
}
