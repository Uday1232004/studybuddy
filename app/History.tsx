"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

const SECONDARY_BUTTON_CLASS =
  "motion-button inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";
const DESTRUCTIVE_BUTTON_CLASS =
  "motion-button inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--bad)] bg-[var(--bad-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--bad)] transition-colors hover:bg-[var(--bad)] hover:text-[var(--on-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bad)] disabled:cursor-not-allowed disabled:opacity-50";

export type SavedKit = {
  id: string;
  title: string | null;
  notes: string;
  sources?: SavedSource[];
  messages?: SavedMessage[];
  created_at: string;
  updated_at?: string;
};

export type SavedSource = {
  name: string;
  type: "pdf" | "text";
  text: string;
  enabled: boolean;
  pages?: number;
};

export type SavedMessage = {
  role: "user" | "assistant";
  content: string;
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
  const savedTitle = kit.title?.trim();
  if (savedTitle) return savedTitle;

  const firstLine = kit.notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ? firstLine.slice(0, 60) : "Untitled notes";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSavedSource(value: unknown): value is SavedSource {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (value.type === "pdf" || value.type === "text") &&
    typeof value.text === "string" &&
    typeof value.enabled === "boolean" &&
    (value.pages === undefined ||
      (typeof value.pages === "number" && Number.isFinite(value.pages)))
  );
}

function isSavedMessage(value: unknown): value is SavedMessage {
  return (
    isRecord(value) &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string"
  );
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
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("study_kits")
        .select("id, title, notes, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(30);

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

  async function openItem(kit: SavedKit) {
    setOpeningId(kit.id);
    setActionError("");
    try {
      const response = await fetch(
        `/api/history/${encodeURIComponent(kit.id)}`
      );
      if (!response.ok) {
        setActionError(
          await getErrorMessage(response, "Could not open this chat.")
        );
        return;
      }

      const data: unknown = await response.json();
      if (
        !isRecord(data) ||
        typeof data.id !== "string" ||
        typeof data.notes !== "string" ||
        !(typeof data.title === "string" || data.title === null) ||
        !Array.isArray(data.sources) ||
        !data.sources.every(isSavedSource) ||
        !Array.isArray(data.messages) ||
        !data.messages.every(isSavedMessage)
      ) {
        setActionError("Could not open this chat. Please try again.");
        return;
      }

      setSelectedId(kit.id);
      onSelect({
        id: data.id,
        title: data.title,
        notes: data.notes,
        sources: data.sources,
        messages: data.messages,
        created_at: kit.created_at,
        updated_at: kit.updated_at,
      });
    } catch {
      setActionError("Could not open this chat. Please try again.");
    } finally {
      setOpeningId(null);
    }
  }

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
    <section className="motion-card mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        My history
      </h2>

      {loading && (
        <p className="loading-pulse mt-3 text-sm text-[var(--muted)]" aria-live="polite">
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
            <li key={kit.id} className="list-row-enter">
              <div className="group flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => void openItem(kit)}
                  disabled={openingId === kit.id}
                  className={`motion-button min-w-0 flex-1 rounded-r-xl border-y border-r px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                    selectedId === kit.id
                      ? "border-l-2 border-l-[var(--accent)] bg-[var(--surface)]"
                      : "border-l-2 border-l-transparent hover:bg-[var(--surface)]"
                  }`}
                >
                  <span className="block truncate text-sm">
                    {openingId === kit.id ? "Opening..." : getTitle(kit)}
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
                    className="motion-button grid size-9 place-items-center rounded-lg text-[var(--muted)] opacity-100 transition-colors hover:bg-[var(--bad-bg)] hover:text-[var(--bad)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bad)] disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
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
                      className={SECONDARY_BUTTON_CLASS}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteItem(kit.id)}
                      disabled={busyAction === `delete:${kit.id}`}
                      className={DESTRUCTIVE_BUTTON_CLASS}
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
