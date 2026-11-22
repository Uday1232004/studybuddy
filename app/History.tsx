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
};

export default function History({ refreshKey, onSelect }: Props) {
  const [kits, setKits] = useState<SavedKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("study_kits")
        .select("id, notes, summary, quiz, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        setError("Could not load your history.");
      } else {
        setKits((data ?? []) as SavedKit[]);
      }
      setLoading(false);
    }
    load();
  }, [refreshKey]);

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
        <p className="mt-3 text-sm text-[var(--bad)]" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && kits.length === 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">No history yet.</p>
      )}

      <ul className="mt-3 space-y-1">
        {kits.map((kit) => (
          <li key={kit.id}>
            <button
              type="button"
              onClick={() => onSelect(kit)}
              className="block w-full rounded-lg border border-transparent px-3 py-2 text-left hover:border-[var(--border)] hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              <span className="block truncate text-sm">
                {kit.notes.split("\n")[0] || "Untitled notes"}
              </span>
              <span className="mt-1 block text-xs text-[var(--muted)]">
                {new Date(kit.created_at).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}