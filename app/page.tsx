"use client";

import { useMemo, useRef, useState } from "react";
import History, { type SavedKit } from "./History";
import MobileTabs, { type TabName } from "./components/MobileTabs";
import TopBar from "./components/TopBar";
import Workspace, { type Source } from "./components/Workspace";

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_SOURCES = 6;

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
  const [sources, setSources] = useState<Source[]>([]);
  const sourcesRef = useRef<Source[]>([]);
  const pdfQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [sourceMessage, setSourceMessage] = useState("");
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>("Workspace");
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const notes = useMemo(
    () =>
      sources
        .filter(
          (source) =>
            source.enabled &&
            !source.loading &&
            !source.error &&
            source.text.trim() !== ""
        )
        .map(
          (source) =>
            `=== SOURCE: ${source.name} ===\n${source.text.trim()}`
        )
        .join("\n\n"),
    [sources]
  );

  function replaceSources(nextSources: Source[]) {
    sourcesRef.current = nextSources;
    setSources(nextSources);
  }

  function uniqueSourceName(name: string) {
    const baseName = name.trim() || "Pasted notes";
    const existingNames = new Set(sourcesRef.current.map((source) => source.name));
    if (!existingNames.has(baseName)) return baseName;

    let suffix = 2;
    while (existingNames.has(`${baseName} (${suffix})`)) {
      suffix++;
    }
    return `${baseName} (${suffix})`;
  }

  function updateSource(id: string, changes: Partial<Source>) {
    replaceSources(
      sourcesRef.current.map((source) =>
        source.id === id ? { ...source, ...changes } : source
      )
    );
  }

  function handleSelect(kit: SavedKit) {
    setActiveHistoryId(kit.id);
    replaceSources([
      {
        id: crypto.randomUUID(),
        type: "text",
        name: "Saved notes",
        text: kit.notes,
        enabled: true,
      },
    ]);
    setSourceMessage("");
    setActiveTab("Workspace");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNewNotes() {
    setActiveHistoryId(null);
    replaceSources([]);
    setSourceMessage("");
    setActiveTab("Workspace");
  }

  function handleToggleSource(id: string, enabled: boolean) {
    replaceSources(
      sourcesRef.current.map((source) =>
        source.id === id ? { ...source, enabled } : source
      )
    );
    setActiveHistoryId(null);
  }

  function handleRemoveSource(id: string) {
    replaceSources(sourcesRef.current.filter((source) => source.id !== id));
    setActiveHistoryId(null);
  }

  function handleAddTextSource(name: string, text: string) {
    if (sourcesRef.current.length >= MAX_SOURCES) {
      setSourceMessage("You can add up to 6 sources.");
      return false;
    }

    const source: Source = {
      id: crypto.randomUUID(),
      type: "text",
      name: uniqueSourceName(name),
      text,
      enabled: true,
    };
    replaceSources([...sourcesRef.current, source]);
    setSourceMessage("");
    setActiveHistoryId(null);
    setActiveHistoryId(null);
    return true;
  }

  function handleHistoryItemsDeleted(ids: string[]) {
    if (activeHistoryId && ids.includes(activeHistoryId)) {
      setActiveHistoryId(null);
      replaceSources([]);
      setSourceMessage("");
    }
  }

  async function processPdfFile(file: File) {
    if (sourcesRef.current.length >= MAX_SOURCES) {
      setSourceMessage("You can add up to 6 sources.");
      return;
    }

    const id = crypto.randomUUID();
    const source: Source = {
      id,
      type: "pdf",
      name: uniqueSourceName(file.name),
      text: "",
      enabled: true,
      loading: true,
    };
    replaceSources([...sourcesRef.current, source]);
    setActiveHistoryId(null);
    setSourceMessage("");

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      updateSource(id, {
        loading: false,
        error: "Please choose a PDF file.",
      });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      updateSource(id, {
        loading: false,
        error: "That PDF is too large. Please use a file under 4 MB.",
      });
      return;
    }

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
        updateSource(id, { loading: false, error: message });
        return;
      }

      if (!isPdfExtractResult(data)) {
        updateSource(id, {
          loading: false,
          error: "Could not read this PDF. Please try again.",
        });
        return;
      }

      updateSource(id, {
        text: data.text,
        pages: data.pages,
        truncated: data.truncated,
        loading: false,
      });
      setActiveHistoryId(null);
    } catch {
      updateSource(id, {
        loading: false,
        error: "Could not reach the server while reading the PDF.",
      });
    }
  }

  function addPdfFiles(files: File[]) {
    const queuedFiles = [...files];
    pdfQueueRef.current = pdfQueueRef.current.then(async () => {
      for (const file of queuedFiles) {
        await processPdfFile(file);
      }
    });
  }

  function handlePdfFile(file: File) {
    addPdfFiles([file]);
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
            sources={sources}
            sourceMessage={sourceMessage}
            uploadingPdf={sources.some((source) => source.loading)}
            isDraggingPdf={isDraggingPdf}
            onPdfFileSelect={handlePdfFile}
            onAddPdfFiles={addPdfFiles}
            onAddTextSource={handleAddTextSource}
            onToggleSource={handleToggleSource}
            onRemoveSource={handleRemoveSource}
            onPdfDragStateChange={setIsDraggingPdf}
          />
        </section>
      </main>
    </div>
  );
}
