"use client";

import { useState } from "react";
import History, { type SavedKit } from "./History";
import MobileTabs, { type TabName } from "./components/MobileTabs";
import TopBar from "./components/TopBar";
import Workspace from "./components/Workspace";
import type { PdfAttachment } from "./components/PdfAttach";

const MAX_PDF_BYTES = 4 * 1024 * 1024;

type PdfExtractResult = {
  text: string;
  pages: number;
  truncated: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPdfExtractResult(value: unknown): value is PdfExtractResult {
  return (
    isRecord(value) &&
    typeof value.text === "string" &&
    typeof value.pages === "number" &&
    typeof value.truncated === "boolean"
  );
}

export default function Home() {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>("Workspace");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfAttachment, setPdfAttachment] = useState<PdfAttachment | null>(null);
  const [showPdfChip, setShowPdfChip] = useState(false);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);

  function handleSelect(kit: SavedKit) {
    setActiveHistoryId(kit.id);
    setNotes(kit.notes);
    setPdfAttachment(null);
    setShowPdfChip(false);
    setError("");
    setActiveTab("Workspace");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNewNotes() {
    setActiveHistoryId(null);
    setNotes("");
    setPdfAttachment(null);
    setShowPdfChip(false);
    setError("");
    setActiveTab("Workspace");
  }

  function handleNotesChange(value: string) {
    setActiveHistoryId(null);
    setNotes(value);
  }

  function handleHistoryItemsDeleted(ids: string[]) {
    if (activeHistoryId && ids.includes(activeHistoryId)) {
      setActiveHistoryId(null);
      setNotes("");
      setPdfAttachment(null);
      setShowPdfChip(false);
      setError("");
    }
  }

  async function handlePdfFile(file: File) {
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Please choose a PDF file.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("That PDF is too large. Please use a file under 4 MB.");
      return;
    }

    setError("");
    setUploadingPdf(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/extract", {
        method: "POST",
        body: form,
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Could not read this PDF. Please try again.";
        setError(message);
        return;
      }

      if (!isPdfExtractResult(data)) {
        setError("Could not read this PDF. Please try again.");
        return;
      }

      setNotes((currentNotes) =>
        currentNotes.trim() === ""
          ? data.text
          : `${currentNotes}\n\n${data.text}`,
      );
      setActiveHistoryId(null);
      setPdfAttachment({
        fileName: file.name,
        pages: data.pages,
        truncated: data.truncated,
      });
      setShowPdfChip(true);
    } catch {
      setError("Could not reach the server while reading the PDF.");
    } finally {
      setUploadingPdf(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <TopBar />
      <MobileTabs activeTab={activeTab} onSelect={setActiveTab} />
      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside
          className={`${activeTab === "Notes" ? "flex" : "hidden"} min-h-0 flex-col border-r border-[var(--border)] bg-[var(--bg)] lg:flex`}
        >
          <div className="overflow-y-auto p-5">
            <button
              type="button"
              onClick={handleNewNotes}
              className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm font-semibold hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <span>+ New notes</span>
              <span className="grid size-7 place-items-center rounded-lg bg-[var(--surface-hover)]" aria-hidden="true">
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M10 4v12M4 10h12" />
                </svg>
              </span>
            </button>
            <History
              refreshKey={0}
              onSelect={handleSelect}
              onItemsDeleted={handleHistoryItemsDeleted}
            />
          </div>
        </aside>
        <section
          className={`${activeTab === "Workspace" ? "flex" : "hidden"} min-h-0 flex-col overflow-y-auto lg:flex`}
        >
          <Workspace
            notes={notes}
            onNotesChange={handleNotesChange}
            error={error}
            uploadingPdf={uploadingPdf}
            pdfAttachment={pdfAttachment}
            showPdfChip={showPdfChip}
            isDraggingPdf={isDraggingPdf}
            onPdfFileSelect={handlePdfFile}
            onDismissPdf={() => setShowPdfChip(false)}
            onPdfDragStateChange={setIsDraggingPdf}
          />
        </section>
      </main>
    </div>
  );
}
