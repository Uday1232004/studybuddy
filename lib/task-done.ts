"use client";

import { createClient } from "./supabase/client";

export async function markTaskDone(
  taskId: string,
  done: boolean
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const doneAt = done ? new Date().toISOString() : null;
    const { error } = await createClient()
      .from("plan_tasks")
      .update({ done, done_at: doneAt })
      .eq("id", taskId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not update this task.",
    };
  }
}
