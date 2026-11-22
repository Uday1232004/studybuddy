"use client";

import { useState } from "react";

type Explanation = {
  simple: string;
  example: string;
};

type RetryRequest = {
  level: "simple" | "simpler";
  previous?: string;
};

type Props = {
  point: string;
  notes: string;
};

function isExplanation(value: unknown): value is Explanation {
  return (
    typeof value === "object" &&
    value !== null &&
    "simple" in value &&
    "example" in value &&
    typeof value.simple === "string" &&
    typeof value.example === "string"
  );
}

export default function ExplainablePoint({ point, notes }: Props) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryRequest, setRetryRequest] = useState<RetryRequest>({
    level: "simple",
  });

  async function requestExplanation(request: RetryRequest) {
    setRetryRequest(request);
    setLoading(true);
    setError("");
    setIsOpen(true);

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          point,
          notes,
          level: request.level,
          ...(request.previous !== undefined
            ? { previous: request.previous }
            : {}),
        }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Could not explain this point. Please try again.";
        throw new Error(message);
      }

      if (!isExplanation(data)) {
        throw new Error("The AI gave an unexpected answer. Please try again.");
      }
      setExplanation(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reach the server. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleExplainClick() {
    if (explanation) {
      setIsOpen(!isOpen);
      return;
    }
    if (!loading) void requestExplanation({ level: "simple" });
  }

  return (
    <li className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="min-w-0 flex-1">{point}</span>
        <button
          type="button"
          onClick={handleExplainClick}
          disabled={loading}
          aria-expanded={isOpen}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
        >
          <svg
            viewBox="0 0 20 20"
            className="size-3.5 text-[var(--accent)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m10 2 1.5 5.5L17 9l-5.5 1.5L10 16l-1.5-5.5L3 9l5.5-1.5L10 2Zm5 10 .8 2.2L18 15l-2.2.8L15 18l-.8-2.2L12 15l2.2-.8L15 12Z" />
          </svg>
          {loading ? "Thinking..." : "Explain"}
        </button>
      </div>

      {isOpen && (
        <div
          aria-live="polite"
          className="ml-0 rounded-r-xl border-l-2 border-[var(--accent)] bg-[var(--surface-hover)] p-4 sm:ml-2"
        >
          {explanation && (
            <>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-[var(--accent)]">
                IN SIMPLE WORDS
              </p>
              <p className="mt-1 text-sm leading-6">{explanation.simple}</p>
              <p className="mt-4 text-[10px] font-semibold tracking-[0.2em] text-[var(--accent)]">
                EXAMPLE
              </p>
              <p className="mt-1 text-sm leading-6">{explanation.example}</p>
            </>
          )}

          {error && (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="text-xs text-[var(--bad)]">{error}</p>
              <button
                type="button"
                onClick={() => void requestExplanation(retryRequest)}
                disabled={loading}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
              >
                Try again
              </button>
            </div>
          )}

          {explanation && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  void requestExplanation({
                    level: "simpler",
                    previous: explanation.simple,
                  })
                }
                disabled={loading}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
              >
                Even simpler
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
