import assert from "node:assert/strict";
import {
  consumeUsage,
  DAILY_LIMITS,
  limitMessage,
} from "../lib/usage-limits.ts";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("ok -", name);
}

function fakeSupabase(result) {
  return {
    async rpc() {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

await test("an allowed usage row returns ok", async () => {
  const result = await consumeUsage(
    fakeSupabase({
      data: [{ allowed: true, used: 2, retry_after_seconds: 0 }],
      error: null,
    }),
    "chat"
  );
  assert.deepEqual(result, { ok: true, used: 2, limit: DAILY_LIMITS.chat });
});

await test("a denied usage row returns the retry time", async () => {
  const result = await consumeUsage(
    fakeSupabase({
      data: [{ allowed: false, used: 5, retry_after_seconds: 7200 }],
      error: null,
    }),
    "study_kit"
  );
  assert.deepEqual(result, {
    ok: false,
    reason: "limit",
    retryAfterSeconds: 7200,
    limit: DAILY_LIMITS.study_kit,
  });
});

await test("an RPC error returns reason error", async () => {
  const result = await consumeUsage(
    fakeSupabase({ data: null, error: new Error("RPC failed") }),
    "chat"
  );
  assert.deepEqual(result, { ok: false, reason: "error" });
});

await test("an RPC exception returns reason error", async () => {
  const result = await consumeUsage(
    fakeSupabase(new Error("RPC threw")),
    "chat"
  );
  assert.deepEqual(result, { ok: false, reason: "error" });
});

await test("each action sends its matching daily limit to the RPC", async () => {
  const calls = [];
  const supabase = {
    async rpc(name, params) {
      calls.push({ name, params });
      return {
        data: [{ allowed: true, used: 1, retry_after_seconds: 0 }],
        error: null,
      };
    },
  };

  for (const [action, limit] of Object.entries(DAILY_LIMITS)) {
    await consumeUsage(supabase, action);
    assert.deepEqual(calls.at(-1), {
      name: "consume_usage",
      params: { p_action: action, p_limit: limit },
    });
  }
});

await test("limit messages include the action limit", () => {
  const message = limitMessage("study_kit", 3600);
  assert.ok(message.includes(String(DAILY_LIMITS.study_kit)));
});

console.log(`\n${passed} tests passed`);
