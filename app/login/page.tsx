"use client";

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
    <main className="flex min-h-full flex-1 items-center justify-center bg-[var(--bg)] px-6 py-12 text-[var(--text)]">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] p-7">
      <h1 className="text-2xl font-semibold tracking-tight">StudyBuddy</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {mode === "login" ? "Log in to continue." : "Create your account."}
      </p>

      <input
        type="email"
        aria-label="Email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-6 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />
      <input
        type="password"
        aria-label="Password"
        placeholder="Password (at least 6 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="mt-4 w-full rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--bg)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
      >
        {loading ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
      </button>

      {message && (
        <div role="alert" className="mt-4 rounded-lg border border-[var(--bad)] bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad)]">
          {message}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setMessage("");
        }}
        className="mt-4 text-sm text-[var(--accent)] underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {mode === "login"
          ? "New here? Create an account"
          : "Already have an account? Log in"}
      </button>
      </div>
    </main>
  );
}