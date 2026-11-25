"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

const RESET_EMAIL_MESSAGE =
  "If an account exists for that email, a reset link is on its way. Check your spam folder too.";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "reset">("signup");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  useEffect(() => {
    if (resetCooldown === 0) return;
    const timer = window.setTimeout(
      () => setResetCooldown((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [resetCooldown]);

  async function handleSubmit() {
    if (mode === "reset") return;
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

  async function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || resetCooldown > 0) return;

    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
    } catch {
      // Keep the response identical whether the email exists or the request fails.
    } finally {
      setMessage(RESET_EMAIL_MESSAGE);
      setResetCooldown(30);
      setLoading(false);
    }
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
          {mode === "reset"
            ? "Enter your email and we’ll send you a password reset link."
            : mode === "login"
              ? "Log in to continue your study session."
              : "Create your account and get started."}
        </p>

        {mode === "reset" ? (
          <form onSubmit={handleResetSubmit} noValidate className="mt-7">
            <input
              type="email"
              aria-label="Email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={loading || resetCooldown > 0}
              className="mt-4 flex w-full items-center justify-between rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
            >
              <span>{loading ? "Sending..." : "Send reset link"}</span>
              <span className="grid size-7 place-items-center rounded-lg bg-[var(--on-accent)]/10" aria-hidden="true">
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3.5 10h12m-5-5 5 5-5 5" />
                </svg>
              </span>
            </button>
            {resetCooldown > 0 && (
              <p className="mt-2 text-center text-xs text-[var(--muted)]">
                You can send another link in {resetCooldown} seconds.
              </p>
            )}
          </form>
        ) : (
          <>
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
              {mode === "login" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("reset");
                      setMessage("");
                    }}
                    className="text-sm font-medium text-[var(--accent)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
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
          </>
        )}

        {message && (
          <div
            role={mode === "reset" ? "status" : "alert"}
            className={`mt-4 rounded-xl border p-3 text-sm ${
              mode === "reset"
                ? "border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
                : "border-[var(--bad)] bg-[var(--bad-bg)] text-[var(--bad)]"
            }`}
          >
            {message}
          </div>
        )}

        {mode === "reset" ? (
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
            className="mt-5 text-sm font-medium text-[var(--accent)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            Back to login
          </button>
        ) : (
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
        )}
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
