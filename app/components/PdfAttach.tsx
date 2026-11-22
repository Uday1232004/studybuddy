"use client";

import { useRef } from "react";

export type PdfAttachment = {
  fileName: string;
  pages: number;
  truncated: boolean;
};

type Props = {
  uploading: boolean;
  onFileSelect: (file: File) => void;
};

export default function PdfAttach({ uploading, onFileSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFileSelect(file);
    event.target.value = "";
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          viewBox="0 0 20 20"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="m7.5 10.5 5.4-5.4a2.1 2.1 0 0 1 3 3l-7.1 7.1a4 4 0 0 1-5.7-5.7l7-7" />
        </svg>
        {uploading ? "Reading PDF..." : "Attach PDF"}
      </button>
      <span className="pl-1 text-[10px] text-[var(--muted)]">
        PDF up to 4 MB. Text-based PDFs only.
      </span>
    </div>
  );
}
