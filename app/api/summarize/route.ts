export async function POST(request: Request) {
  const body = await request.json();
  const notes: string = body.notes ?? "";

  if (notes.trim() === "") {
    return Response.json({ error: "Notes cannot be empty." }, { status: 400 });
  }

  const wordCount = notes.trim().split(/\s+/).length;
  const summary = `Server received ${wordCount} words. (Real AI summary coming soon!)`;

  return Response.json({ summary });
}