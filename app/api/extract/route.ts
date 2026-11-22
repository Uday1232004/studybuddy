import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "../../../lib/supabase/server";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_CHARS = 20000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "That PDF is too large. Please use a file under 4 MB." },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== "%PDF-") {
    return Response.json({ error: "That file is not a valid PDF." }, { status: 400 });
  }

  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const raw = Array.isArray(text) ? text.join("\n\n") : text;
    const cleaned = raw
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (cleaned.length < 20) {
      return Response.json(
        {
          error:
            "No readable text found. Scanned PDFs (pictures of text) are not supported yet.",
        },
        { status: 422 }
      );
    }

    const truncated = cleaned.length > MAX_CHARS;
    return Response.json({
      text: truncated ? cleaned.slice(0, MAX_CHARS) : cleaned,
      pages: totalPages,
      truncated,
    });
  } catch (error) {
    console.error("PDF extract error:", error);
    return Response.json(
      { error: "Could not read this PDF. It may be damaged or password-protected." },
      { status: 422 }
    );
  }
}
