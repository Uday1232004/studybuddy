import { createClient } from "../../../lib/supabase/server";
import { validateHistoryPayload } from "./validation";

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
    return Response.json({ error: "Please send a valid chat." }, { status: 400 });
  }

  const result = validateHistoryPayload(body);
  if (!result.payload) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("study_kits")
    .insert({
      user_id: userId,
      title: result.payload.title,
      notes: result.payload.notes,
      sources: result.payload.sources,
      messages: result.payload.messages,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Could not save chat history:", error);
    return Response.json(
      { error: "Could not save this chat. Please try again." },
      { status: 500 }
    );
  }

  return Response.json({ id: data.id });
}
