import { readTimetable } from "../../../../lib/timetable-vision";
import { validateTimetable } from "../../../../lib/timetable";
import { createClient } from "../../../../lib/supabase/server";
import { consumeUsage, limitMessage } from "../../../../lib/usage-limits";

export const maxDuration = 30;

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type TimetableImage = {
  mimeType: string;
  data: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimetableImage(value: unknown): value is TimetableImage {
  return (
    isRecord(value) &&
    value.mimeType === "image/jpeg" &&
    typeof value.data === "string" &&
    value.data.length > 0 &&
    value.data.length % 4 === 0 &&
    BASE64_PATTERN.test(value.data)
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
    return Response.json(
      { error: "Please send a valid request." },
      { status: 400 }
    );
  }

  if (
    !isRecord(body) ||
    !Array.isArray(body.images) ||
    body.images.length < 1 ||
    body.images.length > 3 ||
    !body.images.every(isTimetableImage) ||
    body.images.reduce(
      (total, image) =>
        total + (isTimetableImage(image) ? image.data.length : 0),
      0
    ) >= 3_600_000
  ) {
    return Response.json(
      { error: "Please send 1 to 3 valid timetable images." },
      { status: 400 }
    );
  }

  const images = body.images;
  const usage = await consumeUsage(supabase, "planner_scan");
  if (!usage.ok) {
    if (usage.reason === "error") {
      return Response.json(
        { error: "Could not check your usage. Please try again." },
        { status: 503 }
      );
    }
    return Response.json(
      {
        error: limitMessage("planner_scan", usage.retryAfterSeconds),
        code: "RATE_LIMIT",
        retryAfterSeconds: usage.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  try {
    const raw = await readTimetable(images);
    const result = validateTimetable(raw);
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "Could not read the timetable. Try a clearer image." },
      { status: 502 }
    );
  }
}
