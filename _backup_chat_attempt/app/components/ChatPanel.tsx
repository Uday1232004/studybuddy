"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  notes: string;
};

const SUGGESTIONS = [
  "Summarize my notes like a teacher, then give a 5 mark exam answer",
  "Explain the hardest part more simply",
  "Quiz me with 5 questions, one at a time",
  "Make a 7 day revision plan from these notes",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default function ChatPanel({ notes }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const newestMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    newestMessageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(message = input) {
    const content = message.trim();
    if (content === "" || loading || notes.trim() === "") return;

    const studentMessage: ChatMessage = { role: "user", content };
    const updatedMessages = [...messages, studentMessage];
    setMessages(updatedMessages);
    setInput("");
    setError("");
    setErrorDetail("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, messages: updatedMessages }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        setError(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "The teacher could not answer. Try again."
        );
        setErrorDetail(
          isRecord(data) && typeof data.detail === "string" ? data.detail : ""
        );
        return;
      }
      if (!isRecord(data) || typeof data.reply !== "string") {
        setError("The teacher could not answer. Try again.");
        return;
      }

      setMessages([
        ...updatedMessages,
        { role: "assistant", content: data.reply },
      ]);
    } catch {
      setError("The teacher could not answer. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--bg)]">
      <header className="shrink-0 border-b border-[var(--border)] px-5 py-4">
        <h1 className="text-lg font-bold">Chat with your teacher</h1>
      </header>
      <div
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-6 py-6 text-center">
            <p className="max-w-md text-base leading-7 text-[var(--muted)]">
              Paste your notes on the left, then ask me anything. I&apos;m your
              teacher.
            </p>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    if (notes.trim() === "") {
                      setInput(suggestion);
                    } else {
                      void sendMessage(suggestion);
                    }
                  }}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm leading-5 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <p
                  style={{ whiteSpace: "pre-wrap" }}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--surface)] text-[var(--text)]"
                  }`}
                >
                  {message.content}
                </p>
              </div>
            ))}
            {loading && (
              <p className="text-sm text-[var(--muted)]">Teacher is thinking...</p>
            )}
          </div>
        )}
        <div ref={newestMessageRef} />
      </div>

      {error && (
        <div className="shrink-0 px-5 pt-2">
          <p role="alert" className="text-sm text-[var(--bad)]">
            {error}
          </p>
          {errorDetail && (
            <p className="mt-1 text-xs text-[var(--muted)]">{errorDetail}</p>
          )}
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex shrink-0 flex-nowrap gap-2 overflow-x-auto px-5 pt-3">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setInput(suggestion)}
              disabled={loading}
              className="shrink-0 whitespace-nowrap rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-end gap-3 border-t border-[var(--border)] bg-[var(--surface)] p-4">
        <textarea
          aria-label="Message your teacher"
          placeholder="Ask a question..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          className="max-h-40 min-h-12 flex-1 resize-y rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm leading-6 text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => void sendMessage()}
          disabled={loading || input.trim() === "" || notes.trim() === ""}
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </section>
  );
}
