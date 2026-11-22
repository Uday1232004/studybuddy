"use client";

import { useState } from "react";
import History, { type SavedKit } from "./History";
import QuizPanel, { type QuizQuestion } from "./components/QuizPanel";
import MobileTabs, { type TabName } from "./components/MobileTabs";
import TopBar from "./components/TopBar";
import Workspace from "./components/Workspace";

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
  const [activeTab, setActiveTab] = useState<TabName>("Workspace");

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
        setHistoryKey((key) => key + 1);
        setActiveTab("Workspace");
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
    setActiveTab("Workspace");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNewNotes() {
    setNotes("");
    setStudy(null);
    setAnswers({});
    setError("");
    setActiveTab("Workspace");
  }

  function choose(questionIndex: number, optionIndex: number) {
    if (answers[questionIndex] !== undefined) return;
    setAnswers({ ...answers, [questionIndex]: optionIndex });
  }

  const answeredCount = Object.keys(answers).length;
  const score = study
    ? study.quiz.filter((question, index) => answers[index] === question.answerIndex).length
    : 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <TopBar />
      <MobileTabs activeTab={activeTab} onSelect={setActiveTab} />
      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside
          className={`${activeTab === "Notes" ? "flex" : "hidden"} min-h-0 flex-col border-r border-[var(--border)] bg-[var(--bg)] lg:flex`}
        >
          <div className="overflow-y-auto p-5">
            <button
              type="button"
              onClick={handleNewNotes}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              + New notes
            </button>
            <History refreshKey={historyKey} onSelect={handleSelect} />
          </div>
        </aside>
        <section
          className={`${activeTab === "Workspace" ? "flex" : "hidden"} min-h-0 flex-col overflow-y-auto lg:flex`}
        >
          <Workspace
            notes={notes}
            onNotesChange={setNotes}
            onGenerate={handleGenerate}
            loading={loading}
            error={error}
            summary={study?.summary ?? null}
          />
        </section>
        <section
          className={`${activeTab === "Quiz" ? "flex" : "hidden"} min-h-0 flex-col border-l border-[var(--border)] lg:flex`}
        >
          <QuizPanel
            quiz={study?.quiz ?? null}
            answers={answers}
            answeredCount={answeredCount}
            score={score}
            loading={loading}
            onChoose={choose}
            onTryAgain={() => setAnswers({})}
          />
        </section>
      </main>
    </div>
  );
}
