import { createClient } from "../../../../lib/supabase/server";
import { embedTexts } from "../../../../lib/embeddings";

type Check = {
  ok: boolean;
  detail?: string;
};

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? message.replaceAll(apiKey, "[redacted]") : message;
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  const signedIn = typeof userId === "string" && userId !== "" && !authError;
  const geminiKeyPresent = Boolean(process.env.GEMINI_API_KEY);

  if (!signedIn) {
    const detail = authError
      ? safeErrorMessage(authError)
      : "Please sign in first.";
    return Response.json(
      {
        signedIn: { ok: false, detail },
        geminiKeyPresent: { ok: geminiKeyPresent },
        embeddingWorks: { ok: false, detail: "Please sign in first." },
        tableReadable: { ok: false, detail: "Please sign in first." },
        insertWorks: { ok: false, detail: "Please sign in first." },
      },
      { status: 401 }
    );
  }

  const checks: Record<string, Check> = {
    signedIn: { ok: true },
    geminiKeyPresent: { ok: geminiKeyPresent },
    embeddingWorks: { ok: false },
    tableReadable: { ok: false },
    insertWorks: { ok: false },
  };
  let testEmbedding: number[] | undefined;

  try {
    const { error } = await supabase
      .from("source_chunks")
      .select("id")
      .limit(1);
    if (error) throw new Error(error.message);
    checks.tableReadable = { ok: true };
  } catch (error) {
    checks.tableReadable = {
      ok: false,
      detail: safeErrorMessage(error),
    };
  }

  try {
    const embeddings = await embedTexts(["test"], "RETRIEVAL_QUERY");
    if (embeddings.length !== 1 || embeddings[0].length !== 768) {
      throw new Error("Expected one embedding with 768 numbers.");
    }
    testEmbedding = embeddings[0];
    checks.embeddingWorks = { ok: true };
  } catch (error) {
    checks.embeddingWorks = {
      ok: false,
      detail: safeErrorMessage(error),
    };
  }

  if (!testEmbedding) {
    checks.insertWorks = {
      ok: false,
      detail: "The embedding check did not return a valid vector.",
    };
  } else {
    const sourceId = crypto.randomUUID();
    const embedding = testEmbedding.map(() => 0);
    try {
      const { error: insertError } = await supabase
        .from("source_chunks")
        .insert({
          user_id: userId,
          source_id: sourceId,
          source_name: "health check",
          page: null,
          chunk_index: 0,
          content: "health check",
          embedding,
        });
      if (insertError) throw new Error(insertError.message);

      const { error: deleteError } = await supabase
        .from("source_chunks")
        .delete()
        .eq("user_id", userId)
        .eq("source_id", sourceId);
      if (deleteError) {
        throw new Error(
          `Test row inserted but could not be deleted: ${deleteError.message}`
        );
      }

      checks.insertWorks = { ok: true };
    } catch (error) {
      checks.insertWorks = {
        ok: false,
        detail: safeErrorMessage(error),
      };
    }
  }

  return Response.json(checks);
}
