"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [updated, setUpdated] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const { data, error } = await createClient().auth.getUser();
        if (active) setHasSession(!error && data.user !== null);
      } catch {
        if (active) setHasSession(false);
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setUpdated(false);

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setMessage(error.message);
        return;
      }

      setUpdated(true);
      setMessage("Password updated.");
      window.setTimeout(() => router.replace("/"), 2000);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update your password. Please try again."
      );
    } finally {
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
        <h2 className="mt-2 text-lg font-bold">Reset your password</h2>

        {hasSession === null ? (
          <p className="mt-5 text-sm text-[var(--muted)]">
            Checking your reset link...
          </p>
        ) : !hasSession ? (
          <>
            <p className="mt-5 text-sm text-[var(--bad)]">
              This reset link is invalid or has expired.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-block text-sm font-medium text-[var(--accent)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              Back to login
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-3">
            <input
              type="password"
              aria-label="New password"
              autoComplete="new-password"
              placeholder="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
            <input
              type="password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={loading || updated}
              className="mt-2 flex w-full items-center justify-between rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
            >
              <span>{loading ? "Please wait..." : "Update password"}</span>
              <span className="grid size-7 place-items-center rounded-lg bg-[var(--on-accent)]/10" aria-hidden="true">
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3.5 10h12m-5-5 5 5-5 5" />
                </svg>
              </span>
            </button>
            {message && (
              <p
                role={updated ? "status" : "alert"}
                className={`rounded-xl border p-3 text-sm ${
                  updated
                    ? "border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
                    : "border-[var(--bad)] bg-[var(--bad-bg)] text-[var(--bad)]"
                }`}
              >
                {message}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
