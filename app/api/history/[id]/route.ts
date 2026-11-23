import { createClient } from "../../../../lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

async function getSignedInUserId() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;

  if (error || typeof userId !== "string" || userId === "") {
    return { supabase, userId: null };
  }

  return { supabase, userId };
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
