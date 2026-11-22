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
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-3xl font-bold">StudyBuddy</h1>
      <p className="mt-2 text-gray-500">
        {mode === "login" ? "Log in to continue." : "Create your account."}
      </p>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-6 w-full rounded border bg-white p-3 text-black"
      />
      <input
        type="password"
        placeholder="Password (at least 6 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-3 w-full rounded border bg-white p-3 text-black"
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-4 w-full rounded bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
      </button>

      {message && (
        <div className="mt-4 rounded border border-red-500 p-3 text-sm">
          {message}
        </div>
      )}

      <button
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setMessage("");
        }}
        className="mt-4 text-sm text-blue-400 underline"
      >
        {mode === "login"
          ? "New here? Create an account"
          : "Already have an account? Log in"}
      </button>
    </main>
  );
}