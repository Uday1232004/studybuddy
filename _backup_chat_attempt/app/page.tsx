"use client";

import { useState } from "react";
import ChatPanel from "./components/ChatPanel";
import TopBar from "./components/TopBar";

const MAX_NOTES = 20000;

export default function Home() {
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(true);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <TopBar />
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[35%_65%] lg:grid-rows-1">
        <aside className="min-h-0 border-b border-[var(--border)] bg-[var(--bg)] lg:flex lg:flex-col lg:border-b-0 lg:border-r">
          <button
            type="button"
            aria-controls="notes-editor"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((open) => !open)}
            className="flex w-full items-center justify-between px-5 py-3 text-left font-semibold lg:hidden"
          >
            <span>Your notes</span>
            <span className="text-sm text-[var(--muted)]">
              {notesOpen ? "Hide" : "Show"}
            </span>
          </button>
          <div
            id="notes-editor"
            className={`${notesOpen ? "flex" : "hidden"} min-h-0 flex-col gap-3 p-4 lg:flex lg:h-full lg:p-6`}
          >
            <h1 className="hidden text-lg font-bold lg:block">Your notes</h1>
            <p className="text-sm text-[var(--muted)]">
              Add your notes here so your teacher can answer from them.
            </p>
            <textarea
              aria-label="Your notes"
              maxLength={MAX_NOTES}
              placeholder="Paste your notes here..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-36 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:h-auto lg:min-h-0 lg:flex-1"
            />
            <p className="text-right text-xs text-[var(--muted)]">
              {notes.length.toLocaleString()} / 20,000 characters
            </p>
          </div>
        </aside>
        <section className="min-h-0 min-w-0 overflow-hidden">
          <ChatPanel notes={notes} />
        </section>
      </main>
    </div>
  );
}
