"use client";

import { useState } from "react";
import SignOutButton from "./SignOutButton";
import History, { type SavedKit } from "./History";

type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

type Study = {
  summary: string[];
  quiz: QuizQuestion[];
};

export default function Home() {
  const [notes, setNotes] = useState("");
  const [study, setStudy] = useState<Study | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [historyKey, setHistoryKey] = useState(0);

  async function handleGenerate() {
    if (notes.trim() === "") {
      setError("Please paste some notes first.");
      return;
    }

    setLoading(true);
    setError("");
    setStudy(null);
    setAnswers({});

    try {
      const response = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        setStudy(data);
        setHistoryKey((k) => k + 1);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(kit: SavedKit) {
    setNotes(kit.notes);
    setStudy({ summary: kit.summary, quiz: kit.quiz });
    setAnswers({});
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function choose(questionIndex: number, optionIndex: number) {
    if (answers[questionIndex] !== undefined) return;
    setAnswers({ ...answers, [questionIndex]: optionIndex });
  }

  const answeredCount = Object.keys(answers).length;
  const score = study
    ? study.quiz.filter((q, i) => answers[i] === q.answerIndex).length
    : 0;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">StudyBuddy</h1>
        <SignOutButton />
      </div>
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
        onClick={handleGenerate}
        disabled={loading}
        className="mt-4 rounded bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Working..." : "Create study kit"}
      </button>

      {error && (
        <div className="mt-6 rounded border border-red-500 p-4">{error}</div>
      )}

      {study && (
        <>
          <section className="mt-6 rounded border p-4">
            <h2 className="text-xl font-semibold">Summary</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {study.summary.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="mt-6">
            <h2 className="text-xl font-semibold">Quiz</h2>

            {study.quiz.map((q, qi) => {
              const picked = answers[qi];
              const answered = picked !== undefined;

              return (
                <div key={qi} className="mt-4 rounded border p-4">
                  <p className="font-medium">
                    {qi + 1}. {q.question}
                  </p>

                  <div className="mt-3 space-y-2">
                    {q.options.map((option, oi) => {
                      let style = "border-gray-500 hover:bg-gray-500/20";
                      if (answered && oi === q.answerIndex) {
                        style = "border-green-500 bg-green-500/20";
                      } else if (answered && oi === picked) {
                        style = "border-red-500 bg-red-500/20";
                      }

                      return (
                        <button
                          key={oi}
                          onClick={() => choose(qi, oi)}
                          disabled={answered}
                          className={`block w-full rounded border px-3 py-2 text-left ${style}`}
                        >
                          {"ABCD"[oi]}. {option}
                        </button>
                      );
                    })}
                  </div>

                  {answered && (
                    <p className="mt-3 text-sm text-gray-400">{q.explanation}</p>
                  )}
                </div>
              );
            })}

            {answeredCount === study.quiz.length && (
              <p className="mt-4 text-lg font-semibold">
                Your score: {score} / {study.quiz.length}
              </p>
            )}
          </section>
        </>
      )}

      <History refreshKey={historyKey} onSelect={handleSelect} />
    </main>
  );
}