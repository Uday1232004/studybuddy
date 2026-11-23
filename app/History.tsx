"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

export type SavedKit = {
  id: string;
  notes: string;
  summary: string[];
  quiz: {
    question: string;
    options: string[];
    answerIndex: number;
    explanation: string;
  }[];
  created_at: string;
};

type Props = {
  refreshKey: number;
  onSelect: (kit: SavedKit) => void;
  onItemsDeleted: (ids: string[]) => void;
};

type Confirmation =
  | { type: "item"; id: string }
  | null;

function getTitle(kit: SavedKit) {
  const firstLine = kit.notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ? firstLine.slice(0, 60) : "Untitled notes";
}

async function getErrorMessage(response: Response, fallback: string) {
  try {
    const data: unknown = await response.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
    ) {
      return data.error;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export default function History({
  refreshKey,
  onSelect,
  onItemsDeleted,
}: Props) {
  const [kits, setKits] = useState<SavedKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("study_kits")
        .select("id, notes, summary, quiz, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("Could not load study history:", {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        setError("Could not load your history.");
        if (process.env.NODE_ENV !== "production") {
          setErrorDetail(error.message);
        }
      } else {
        setKits((data ?? []) as SavedKit[]);
      }
      setLoading(false);
    }
    load();
  }, [refreshKey]);

  async function deleteItem(id: string) {
    setBusyAction(`delete:${id}`);
    setActionError("");
    try {
      const response = await fetch(`/api/history/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setActionError(
          await getErrorMessage(response, "Could not delete this chat.")
        );
        return;
      }

      setKits((current) => current.filter((item) => item.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      setConfirmation(null);
      onItemsDeleted([id]);
    } catch {
      setActionError("Could not delete this chat. Please try again.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="mt-7">
      <h2 className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        My history
      </h2>

      {loading && (
        <p className="mt-3 text-sm text-[var(--muted)]" aria-live="polite">
          Loading...
        </p>
      )}
      {error && (
        <div className="mt-3">
          <p className="text-sm text-[var(--bad)]" role="alert">
            {error}
          </p>
          {errorDetail && (
            <p className="mt-1 text-xs text-[var(--muted)]">{errorDetail}</p>
          )}
        </div>
      )}
      {!loading && !error && kits.length === 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">No history yet.</p>
      )}

      <ul className="mt-3 space-y-2">
        {kits.map((kit) => {
          const isConfirming = confirmation?.id === kit.id;

          return (
            <li key={kit.id}>
              <div className="group flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(kit.id);
                    onSelect(kit);
                  }}
                  className={`min-w-0 flex-1 rounded-r-xl border-y border-r px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                    selectedId === kit.id
                      ? "border-l-2 border-l-[var(--accent)] bg-[var(--surface)]"
                      : "border-l-2 border-l-transparent hover:bg-[var(--surface)]"
                  }`}
                >
                  <span className="block truncate text-sm">
                    {getTitle(kit)}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {new Date(kit.created_at).toLocaleDateString()}
                  </span>
                </button>

                {/* Rename needs a title column in the study_kits table. */}
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setActionError("");
                      setConfirmation({ type: "item", id: kit.id });
                    }}
                    disabled={busyAction === `delete:${kit.id}`}
                    aria-label={`Delete ${getTitle(kit)}`}
                    title="Delete chat"
                    className="grid size-9 place-items-center rounded-lg text-[var(--muted)] opacity-100 hover:bg-[var(--bad-bg)] hover:text-[var(--bad)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden="true"
                    >
                      <path d="M4.5 6h11M8 6V4h4v2m2 0-.6 10H6.6L6 6m2.5 3v4m3-4v4" />
                    </svg>
                  </button>
                </div>
              </div>

              {isConfirming && (
                <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <p className="text-sm text-[var(--text)]">
                    Delete this chat? This cannot be undone.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmation(null)}
                      disabled={busyAction === `delete:${kit.id}`}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteItem(kit.id)}
                      disabled={busyAction === `delete:${kit.id}`}
                      className="rounded-lg bg-[var(--bad)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {busyAction === `delete:${kit.id}`
                        ? "Deleting..."
                        : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {actionError && (
        <p className="mt-3 text-sm text-[var(--bad)]" role="alert">
          {actionError}
        </p>
      )}

    </section>
  );
}
