"use client";

import type { DragEvent } from "react";
import ChatPanel from "./ChatPanel";
import type { PdfAttachment } from "./PdfAttach";

type Props = {
  notes: string;
  onNotesChange: (notes: string) => void;
  error: string;
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
  error,
  uploadingPdf,
  pdfAttachment,
  showPdfChip,
  isDraggingPdf,
  onPdfFileSelect,
  onDismissPdf,
  onPdfDragStateChange,
}: Props) {
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
      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-[var(--bad)] bg-[var(--bad-bg)] p-4 text-sm text-[var(--bad)]"
        >
          {error}
        </div>
      )}

      <ChatPanel
        notes={notes}
        onPdfFileSelect={onPdfFileSelect}
        pdfFileName={showPdfChip ? pdfAttachment?.fileName : undefined}
        uploadingPdf={uploadingPdf}
        onDismissPdf={onDismissPdf}
      />
    </div>
  );
}
