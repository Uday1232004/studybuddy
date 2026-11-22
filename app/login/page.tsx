"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (email.trim() === "" || password === "") {
      setMessage("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setMessage("");
    const supabase = createClient();

    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-[var(--bg)] px-5 py-12 text-[var(--text)]">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 sm:p-9">
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
          WELCOME
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
          StudyBuddy
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {mode === "login"
            ? "Log in to continue your study session."
            : "Create your account and get started."}
        </p>

        <div className="mt-7 space-y-3">
          <input
            type="email"
            aria-label="Email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          />
          <input
            type="password"
            aria-label="Password"
            placeholder="Password (at least 6 characters)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="mt-4 flex w-full items-center justify-between rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
        >
          <span>
            {loading ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
          </span>
          <span className="grid size-7 place-items-center rounded-lg bg-[var(--on-accent)]/10" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3.5 10h12m-5-5 5 5-5 5" />
            </svg>
          </span>
        </button>

        {message && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[var(--bad)] bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad)]"
          >
            {message}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage("");
          }}
          className="mt-5 text-sm font-medium text-[var(--accent)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Log in"}
        </button>
        <div className="mt-7 border-t border-[var(--border)] pt-5">
          <Link
            href="/welcome"
            className="text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
