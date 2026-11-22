"use client";

import { useState } from "react";

export default function Home() {
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState("");

  function handleSummarize() {
    if (notes.trim() === "") {
      setResult("Please paste some notes first.");
      return;
    }
    const wordCount = notes.trim().split(/\s+/).length;
    setResult(`You pasted ${wordCount} words. (Real AI summary coming soon!)`);
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
        className="mt-4 rounded bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
      >
        Summarize
      </button>

      {result && <div className="mt-6 rounded border p-4">{result}</div>}
    </main>
  );
}