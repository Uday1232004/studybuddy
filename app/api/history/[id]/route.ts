import { createClient } from "../../../../lib/supabase/server";
import { validateHistoryPayload } from "../validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getHistorySources(value: unknown) {
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

    const metadata = {
      name: source.name,
      type: source.type,
      text: "",
      enabled: source.enabled,
      ...(typeof source.pages === "number" ? { pages: source.pages } : {}),
    };
    return typeof source.id === "string" && UUID_PATTERN.test(source.id)
      ? [{ ...metadata, id: source.id }]
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
    sources: getHistorySources(data.sources),
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

  const result = validateHistoryPayload(body);
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

  return Response.json({ id: data.id });
}
