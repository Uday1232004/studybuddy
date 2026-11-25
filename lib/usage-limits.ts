import type { createClient } from "./supabase/server";

export type UsageAction = "chat" | "study_kit" | "planner_scan" | "pdf_upload";

export const DAILY_LIMITS: Record<UsageAction, number> = {
  chat: 40,
  study_kit: 5,
  planner_scan: 5,
  pdf_upload: 3,
};

const ACTION_LABELS: Record<UsageAction, string> = {
  chat: "chat messages",
  study_kit: "study kits",
  planner_scan: "planner scans",
  pdf_upload: "PDF uploads",
};

type UsageSupabase = Awaited<ReturnType<typeof createClient>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function consumeUsage(
  supabase: UsageSupabase,
  action: UsageAction
): Promise<
  | { ok: true; used: number; limit: number }
  | {
      ok: false;
      reason: "limit";
      retryAfterSeconds: number;
      limit: number;
    }
  | { ok: false; reason: "error" }
> {
  try {
    const { data, error } = await supabase.rpc("consume_usage", {
      p_action: action,
      p_limit: DAILY_LIMITS[action],
    });
    if (error) return { ok: false, reason: "error" };

    const result: unknown = data;
    const row = Array.isArray(result)
      ? result.length === 1
        ? result[0]
        : null
      : result;
    if (
      !isRecord(row) ||
      typeof row.allowed !== "boolean" ||
      typeof row.used !== "number" ||
      !Number.isInteger(row.used) ||
      row.used < 0
    ) {
      return { ok: false, reason: "error" };
    }

    if (row.allowed) {
      return { ok: true, used: row.used, limit: DAILY_LIMITS[action] };
    }
    if (
      typeof row.retry_after_seconds !== "number" ||
      !Number.isInteger(row.retry_after_seconds) ||
      row.retry_after_seconds < 0
    ) {
      return { ok: false, reason: "error" };
    }
    return {
      ok: false,
      reason: "limit",
      retryAfterSeconds: row.retry_after_seconds,
      limit: DAILY_LIMITS[action],
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export function limitMessage(
  action: UsageAction,
  retryAfterSeconds: number
): string {
  const minutes = Math.max(1, Math.round(Math.max(0, retryAfterSeconds) / 60));
  const wait =
    minutes < 60
      ? `${minutes} minute${minutes === 1 ? "" : "s"}`
      : `${Math.max(1, Math.round(minutes / 60))} hour${
          Math.round(minutes / 60) === 1 ? "" : "s"
        }`;
  return `Daily limit reached for ${ACTION_LABELS[action]} (${DAILY_LIMITS[action]} per day). Try again in about ${wait}.`;
}
