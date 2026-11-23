import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "../../../lib/supabase/server";

const MAX_BYTES = 150 * 1024 * 1024;
const MAX_PAGES = 2000;

function cleanPage(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
      { error: "That PDF is too large. Please use a file under 150 MB." },
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
    const { totalPages, text } = await extractText(pdf);
    if (totalPages > MAX_PAGES) {
      return Response.json(
        { error: "This PDF has more than 2,000 pages. Please use a shorter PDF." },
        { status: 413 }
      );
    }

    const pages = (Array.isArray(text) ? text : [text]).map(cleanPage);
    const characterCount = pages.reduce((total, page) => total + page.length, 0);
    if (characterCount < 20) {
      return Response.json(
        {
          error:
            "No readable text found. Scanned PDFs (pictures of text) are not supported yet.",
        },
        { status: 422 }
      );
    }

    const combinedText = pages.join("\n\n");
    return Response.json({
      text: combinedText.slice(0, 20000),
      pages,
      pageCount: totalPages,
    });
  } catch (error) {
    console.error("PDF extract error:", error);
    return Response.json(
      { error: "Could not read this PDF. It may be damaged or password-protected." },
      { status: 422 }
    );
  }
}
