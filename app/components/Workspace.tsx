"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ChatPanel, {
  type ChatMessage,
  type ChatRestoreSession,
} from "./ChatPanel";

export type Source = {
  id: string;
  type: "pdf" | "text";
  name: string;
  preview: string;
  enabled: boolean;
  pages?: number;
  status?: "reading" | "indexing";
  progress?: { start: number; end: number; total: number };
  error?: string;
  errorDetail?: string;
  retryable?: boolean;
};

type Props = {
  restoreSession: ChatRestoreSession;
  onMessagesChange: (messages: ChatMessage[]) => void;
  onAssistantReply: (messages: ChatMessage[]) => void;
  sources: Source[];
  sourceMessage: string;
  uploadingPdf: boolean;
  isDraggingPdf: boolean;
  onPdfFileSelect: (file: File) => void;
  onAddPdfFiles: (files: File[]) => void;
  onAddTextSource: (name: string, text: string) => boolean;
  onRetrySource: (id: string) => void;
  onToggleSource: (id: string, enabled: boolean) => void;
  onRemoveSource: (id: string) => void;
  onPdfDragStateChange: (dragging: boolean) => void;
};

const MAX_SOURCES = 20;
const MOBILE_QUERY = "(max-width: 1023px)";

function subscribeToMobileChanges(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia(MOBILE_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getIsMobile() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;
}

export default function Workspace({
  restoreSession,
  onMessagesChange,
  onAssistantReply,
  sources,
  sourceMessage,
  uploadingPdf,
  isDraggingPdf,
  onPdfFileSelect,
  onAddPdfFiles,
  onAddTextSource,
  onRetrySource,
  onToggleSource,
  onRemoveSource,
  onPdfDragStateChange,
}: Props) {
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [sourceName, setSourceName] = useState("Pasted notes");
  const [sourceText, setSourceText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useSyncExternalStore(
    subscribeToMobileChanges,
    getIsMobile,
    () => false
  );
  const sourcesExpanded =
    expandedOverride ?? (sources.length === 0 || !isMobile);
  const sourceIds = useMemo(
    () =>
      sources
        .filter(
          (source) =>
            source.enabled && !source.status && !source.error
        )
        .map((source) => source.id),
    [sources]
  );
  const indexedPages = sources.reduce(
    (total, source) =>
      source.status || source.error ? total : total + (source.pages ?? 0),
    0
  );

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    onPdfDragStateChange(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
    }
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    onPdfDragStateChange(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    onPdfDragStateChange(false);
    onAddPdfFiles(Array.from(event.dataTransfer.files));
  }

  function handlePdfChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    if (files.length > 0) onAddPdfFiles(files);
    event.currentTarget.value = "";
    setAddMenuOpen(false);
  }

  function addTextSource() {
    if (sourceText.trim() === "") return;
    if (onAddTextSource(sourceName, sourceText)) {
      setSourceName("Pasted notes");
      setSourceText("");
      setPasteOpen(false);
    }
  }

  function dismissComposerPdf() {
    const latestPdf = [...sources].reverse().find((source) => source.type === "pdf");
    if (latestPdf) onRemoveSource(latestPdf.id);
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-8 sm:py-8">
      <section
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative rounded-2xl border bg-[var(--surface)] p-4 shadow-sm transition-colors sm:p-5 ${
          isDraggingPdf
            ? "border-dashed border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]"
            : "border-[var(--border)]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={handlePdfChange}
          className="sr-only"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => setExpandedOverride(!sourcesExpanded)}
          aria-expanded={sourcesExpanded}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="text-lg font-bold">Sources</span>
          <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
            {sources.length} {sources.length === 1 ? "source" : "sources"}
            <svg
              viewBox="0 0 20 20"
              className={`size-4 transition-transform ${
                sourcesExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </span>
        </button>

        {sourcesExpanded && (
          <div className="mt-4">
            {sources.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--muted)]">
                Add PDFs or paste text. Your teacher reads only the sources you
                tick.
              </p>
            ) : (
              <ul className="space-y-2">
                {sources.map((source) => (
                  <li
                    key={source.id}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={(event) =>
                        onToggleSource(source.id, event.target.checked)
                      }
                      aria-label={`Use ${source.name}`}
                      className="size-4 shrink-0 accent-[var(--accent)]"
                    />
                    {source.type === "pdf" ? (
                      <svg
                        viewBox="0 0 20 20"
                        className="size-5 shrink-0 text-[var(--muted)]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <path d="M5 2.75h6l4 4v10.5H5z" />
                        <path d="M11 2.75v4h4M7.5 10h5M7.5 13h5" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 20 20"
                        className="size-5 shrink-0 text-[var(--muted)]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <path d="M5 3.5h10v13H5zM7.5 7h5M7.5 10h5M7.5 13h3" />
                      </svg>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text)]">
                        {source.name}
                      </p>
                      {source.status === "reading" ? (
                        <p className="truncate text-xs text-[var(--muted)]">
                          {source.progress?.total
                            ? `Reading page ${Math.max(source.progress.start, 1)} of ${source.progress.total}`
                            : `Reading ${source.name}...`}
                        </p>
                      ) : source.status === "indexing" ? (
                        <p className="text-xs text-[var(--muted)]">
                          Indexing pages {source.progress?.start ?? 1}-
                          {source.progress?.end ?? 1} of{" "}
                          {source.progress?.total ?? 0} (waiting for the
                          free-tier speed limit...)
                        </p>
                      ) : source.error ? (
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="min-w-0 truncate text-xs text-[var(--bad)]">
                              {source.error}
                            </p>
                            {source.retryable && (
                              <button
                                type="button"
                                onClick={() => onRetrySource(source.id)}
                                className="shrink-0 text-xs font-semibold text-[var(--bad)] underline underline-offset-2"
                              >
                                Retry
                              </button>
                            )}
                          </div>
                          {source.errorDetail && (
                            <p className="mt-1 truncate text-xs text-[var(--muted)]">
                              {source.errorDetail}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--muted)]">
                          {source.pages ?? 0}{" "}
                          {(source.pages ?? 0) === 1 ? "page" : "pages"}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveSource(source.id)}
                      aria-label={`${source.status ? "Cancel" : "Remove"} ${source.name}`}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="m5 5 10 10M15 5 5 15" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {sourceMessage && (
              <p className="mt-3 text-sm text-[var(--bad)]" role="alert">
                {sourceMessage}
              </p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-xs text-[var(--muted)]">
                {sources.length} {sources.length === 1 ? "source" : "sources"},{" "}
                {indexedPages} pages indexed
              </p>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setAddMenuOpen((open) => !open)}
                  disabled={sources.length >= MAX_SOURCES}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Add source
                </button>
                {addMenuOpen && (
                  <div className="absolute bottom-full right-0 z-10 mb-2 w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-lg">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sources.length >= MAX_SOURCES}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    >
                      Upload PDFs
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setPasteOpen(true);
                      }}
                      disabled={sources.length >= MAX_SOURCES}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    >
                      Paste text
                    </button>
                  </div>
                )}
              </div>
            </div>

            {pasteOpen && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                <label className="block text-xs font-semibold text-[var(--muted)]">
                  Source name
                  <input
                    value={sourceName}
                    onChange={(event) => setSourceName(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  />
                </label>
                <label className="mt-3 block text-xs font-semibold text-[var(--muted)]">
                  Text
                  <textarea
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    rows={5}
                    className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  />
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPasteOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addTextSource}
                    disabled={sourceText.trim() === ""}
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--on-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <ChatPanel
        sourceIds={sourceIds}
        restoreSession={restoreSession}
        onMessagesChange={onMessagesChange}
        onAssistantReply={onAssistantReply}
        onPdfFileSelect={onPdfFileSelect}
        uploadingPdf={uploadingPdf}
        onDismissPdf={dismissComposerPdf}
      />
    </div>
  );
}
