"use client";

import { useState, type DragEvent } from "react";
import ExplainablePoint from "./ExplainablePoint";
import PdfAttach, { type PdfAttachment } from "./PdfAttach";

type Props = {
  notes: string;
  onNotesChange: (notes: string) => void;
  onGenerate: (mode: "quick" | "teacher", marks: 2 | 5 | 10) => void;
  loading: boolean;
  error: string;
  summary: string[] | null;
  teacher: string | null;
  explanationKey: number;
  uploadingPdf: boolean;
  pdfAttachment: PdfAttachment | null;
  showPdfChip: boolean;
  isDraggingPdf: boolean;
  onPdfFileSelect: (file: File) => void;
  onDismissPdf: () => void;
  onPdfDragStateChange: (dragging: boolean) => void;
};

export default function Workspace({
  notes,
  onNotesChange,
  onGenerate,
  loading,
  error,
  summary,
  teacher,
  explanationKey,
  uploadingPdf,
  pdfAttachment,
  showPdfChip,
  isDraggingPdf,
  onPdfFileSelect,
  onDismissPdf,
  onPdfDragStateChange,
}: Props) {
  const [mode, setMode] = useState<"quick" | "teacher">("quick");
  const [marks, setMarks] = useState<2 | 5 | 10>(5);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    onPdfDragStateChange(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    onPdfDragStateChange(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    onPdfDragStateChange(false);
    const file = event.dataTransfer.files.item(0);
    if (file) onPdfFileSelect(file);
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-8 sm:px-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
        WORKSPACE
      </p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
        Paste. Generate. Practice.
      </h1>
      {showPdfChip && pdfAttachment && (
        <div className="mt-5 inline-flex max-w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <span className="min-w-0 truncate text-xs font-medium">
            {pdfAttachment.fileName}
            <span className="ml-2 text-[var(--muted)]">
              {pdfAttachment.pages} {pdfAttachment.pages === 1 ? "page" : "pages"}
            </span>
          </span>
          <button
            type="button"
            onClick={onDismissPdf}
            aria-label="Dismiss attached PDF"
            className="grid size-6 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </div>
      )}
      {pdfAttachment?.truncated && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Only the first 20,000 characters were used.
        </p>
      )}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`mt-5 rounded-2xl border bg-[var(--surface)] p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)] ${
          isDraggingPdf
            ? "border-dashed border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]"
            : "border-[var(--border)]"
        }`}
      >
        <textarea
          aria-label="Your notes"
          placeholder="Paste your notes here..."
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          className="min-h-48 w-full resize-y rounded-xl border-0 bg-transparent p-4 text-sm leading-6 text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
          Mode
          <select
            value={mode}
            onChange={(event) =>
              setMode(event.target.value === "teacher" ? "teacher" : "quick")
            }
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <option value="quick">Quick summary + quiz</option>
            <option value="teacher">Teacher explanation + exam answer</option>
          </select>
        </label>
        {mode === "teacher" && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
            Marks
            <select
              value={marks}
              onChange={(event) => {
                const selectedMarks = Number(event.target.value);
                if (
                  selectedMarks === 2 ||
                  selectedMarks === 5 ||
                  selectedMarks === 10
                ) {
                  setMarks(selectedMarks);
                }
              }}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <option value={2}>2</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => onGenerate(mode, marks)}
          disabled={loading || uploadingPdf}
          aria-live="polite"
          className="inline-flex items-center gap-3 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working..." : "Create study kit"}
          <span className="grid size-7 place-items-center rounded-lg bg-[var(--on-accent)]/10" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3.5 10h12m-5-5 5 5-5 5" />
            </svg>
          </span>
        </button>
        <PdfAttach uploading={uploadingPdf} onFileSelect={onPdfFileSelect} />
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-[var(--bad)] bg-[var(--bad-bg)] p-4 text-sm text-[var(--bad)]"
        >
          {error}
        </div>
      )}

      <section aria-live="polite" className="mt-9">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
              YOUR STUDY KIT
            </p>
            <h2 className="mt-2 text-xl font-bold">
              {teacher !== null ? "Teacher response" : "Summary"}
            </h2>
          </div>
        </div>
        {loading ? (
          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 animate-pulse">
            <div className="h-3 w-5/6 rounded bg-[var(--surface-hover)]" />
            <div className="h-3 w-full rounded bg-[var(--surface-hover)]" />
            <div className="h-3 w-2/3 rounded bg-[var(--surface-hover)]" />
          </div>
        ) : teacher !== null ? (
          <div
            style={{ whiteSpace: "pre-wrap" }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm leading-7 sm:p-6"
          >
            {teacher}
          </div>
        ) : summary ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
            <ul className="list-disc space-y-3 pl-5 text-sm leading-6">
              {summary.map((point, index) => (
                <ExplainablePoint
                  key={`${explanationKey}-${index}`}
                  point={point}
                  notes={notes}
                />
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
            Paste notes and create a study kit to see your summary here
          </p>
        )}
      </section>
    </div>
  );
}
