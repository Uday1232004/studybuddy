"use client";

import { useState } from "react";

export default function Home() {
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSummarize() {
    if (notes.trim() === "") {
      setResult("Please paste some notes first.");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await response.json();

      if (!response.ok) {
        setResult(data.error || "Something went wrong.");
      } else {
        setResult(data.summary);
      }
    } catch {
      setResult("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">StudyBuddy</h1>
      <p className="mt-2 text-gray-500">
        Paste your notes. Get a summary and a quiz.
      </p>

      <textarea
        className="mt-6 h-48 w-full rounded border bg-white p-3 text-black"
        placeholder="Paste your notes here..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <button
        onClick={handleSummarize}
        disabled={loading}
        className="mt-4 rounded bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Summarizing..." : "Summarize"}
      </button>

      {result && <div className="mt-6 whitespace-pre-wrap rounded border p-4">{result}</div>}
    </main>
  );
}