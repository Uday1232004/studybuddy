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
    <section className="mt-10">
      <h2 className="text-xl font-semibold">My history</h2>

      {loading && <p className="mt-2 text-sm text-gray-500">Loading...</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {!loading && !error && kits.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">No saved study kits yet.</p>
      )}

      <ul className="mt-3 space-y-2">
        {kits.map((kit) => (
          <li key={kit.id}>
            <button
              onClick={() => onSelect(kit)}
              className="block w-full rounded border px-3 py-2 text-left hover:bg-gray-500/20"
            >
              <span className="block truncate">{kit.notes.slice(0, 80)}</span>
              <span className="block text-xs text-gray-500">
                {new Date(kit.created_at).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}