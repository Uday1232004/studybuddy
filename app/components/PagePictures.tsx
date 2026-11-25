"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractCitations,
  type ExtractedCitation,
} from "../../lib/citations";
import {
  getPdfForSource,
  getPdfUrlForSource,
  renderPageToCanvas,
  type PdfSource,
} from "../../lib/pdf-render";
import type { PDFDocumentProxy } from "pdfjs-dist";

export type PagePictureSource = {
  id: string;
  name: string;
  filePath: string | null;
  pages?: number;
};

type Props = {
  text: string;
  sources: PagePictureSource[];
};

type SelectedPage = {
  source: PdfSource;
  page: number;
};

function hasFilePath(source: PagePictureSource): source is PdfSource {
  return typeof source.filePath === "string" && source.filePath !== "";
}

function pageLabel(source: PdfSource, page: number) {
  const name = source.name.replace(/\.[^.]+$/, "");
  const shortName = name.length > 24 ? `${name.slice(0, 21)}...` : name;
  return `${shortName} - p. ${page}`;
}

function PageThumbnail({
  source,
  page,
  onOpen,
}: {
  source: PdfSource;
  page: number;
  onOpen: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined"
  );
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = buttonRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas) return;

    let active = true;
    setError("");
    setLoaded(false);
    void getPdfForSource(source)
      .then((pdf) => renderPageToCanvas(pdf, page, canvas, 180))
      .then(() => {
        if (active) setLoaded(true);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : "Could not draw this page"
          );
        }
      });

    return () => {
      active = false;
    };
  }, [page, source, visible]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onOpen}
      aria-label={`Open ${pageLabel(source, page)}`}
      className="w-[180px] shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <span className="grid min-h-[220px] w-full place-items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
        <canvas
          ref={canvasRef}
          className={`max-w-full ${loaded ? "block" : "hidden"}`}
        />
        {!loaded && (
          <span className="px-3 py-2 text-center text-xs text-[var(--muted)]">
            {error || "Loading page..."}
          </span>
        )}
      </span>
      <span className="mt-1 block truncate text-xs text-[var(--muted)]">
        {pageLabel(source, page)}
      </span>
    </button>
  );
}

function PageModal({
  source,
  page,
  onClose,
}: {
  source: PdfSource;
  page: number;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(page);
  const [targetWidth, setTargetWidth] = useState(900);
  const [signedUrl, setSignedUrl] = useState("");
  const [loadError, setLoadError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [drawError, setDrawError] = useState("");
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    void getPdfForSource(source)
      .then((loadedPdf) => {
        if (active) setPdf(loadedPdf);
      })
      .catch(() => {
        if (active) setLoadError("Could not load the PDF");
      });
    void getPdfUrlForSource(source)
      .then((url) => {
        if (active) setSignedUrl(url);
      })
      .catch(() => {
        if (active) setLinkError("Could not create a PDF link");
      });
    return () => {
      active = false;
    };
  }, [source]);

  useEffect(() => {
    const updateWidth = () => {
      setTargetWidth(Math.min(900, Math.max(1, window.innerWidth - 64)));
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    let active = true;
    setRendering(true);
    setDrawError("");
    void renderPageToCanvas(pdf, currentPage, canvas, targetWidth)
      .then(() => {
        if (active) setRendering(false);
      })
      .catch((reason: unknown) => {
        if (active) {
          setDrawError(
            reason instanceof Error ? reason.message : "Could not draw this page"
          );
          setRendering(false);
        }
      });
    return () => {
      active = false;
    };
  }, [currentPage, pdf, targetWidth]);

  const pageCount = pdf?.numPages ?? source.pages ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PDF page preview"
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--text)]/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto my-4 w-full max-w-[950px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[var(--text)]">
              {pageLabel(source, currentPage)}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close page preview"
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Close
          </button>
        </div>

        <div className="mt-4 max-h-[calc(100dvh-220px)] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg)]">
          {loadError ? (
            <p role="alert" className="p-6 text-sm text-[var(--bad)]">
              {loadError}
            </p>
          ) : (
            <div className="relative min-h-32 w-fit min-w-full">
              <canvas ref={canvasRef} className="mx-auto max-w-full" />
              {(rendering || drawError) && (
                <p
                  role={drawError ? "alert" : undefined}
                  className={`absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm ${
                    drawError ? "text-[var(--bad)]" : "text-[var(--muted)]"
                  }`}
                >
                  {drawError || "Loading page..."}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
              disabled={currentPage <= 1}
              className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous page
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((current) => Math.min(pageCount, current + 1))
              }
              disabled={currentPage >= pageCount}
              className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next page
            </button>
          </div>
          {signedUrl ? (
            <a
              href={`${signedUrl}#page=${currentPage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded text-sm font-semibold text-[var(--accent)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Open PDF at this page
            </a>
          ) : linkError ? (
            <span className="text-xs text-[var(--bad)]">{linkError}</span>
          ) : (
            <span className="text-xs text-[var(--muted)]">Preparing PDF link...</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PagePictures({ text, sources }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [selectedPage, setSelectedPage] = useState<SelectedPage | null>(null);
  const closeModal = useCallback(() => setSelectedPage(null), []);
  const fileSources = useMemo(
    () => sources.filter(hasFilePath),
    [sources]
  );
  const citations = useMemo(
    () => extractCitations(text, fileSources),
    [fileSources, text]
  );
  const sourcesById = useMemo(
    () => new Map(fileSources.map((source) => [source.id, source])),
    [fileSources]
  );

  if (citations.length === 0) return null;

  const displayedCitations = showAll ? citations : citations.slice(0, 4);
  const remainingCount = citations.length - displayedCitations.length;

  return (
    <>
      <section
        aria-label="Pages cited from your PDFs"
        className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
      >
        <h3 className="mb-2 text-xs font-semibold text-[var(--muted)]">
          Pages from your PDFs
        </h3>
        <div className="flex flex-wrap gap-3">
          {displayedCitations.map((citation: ExtractedCitation) => {
            const source = sourcesById.get(citation.sourceId);
            if (!source) return null;
            return (
              <PageThumbnail
                key={`${citation.sourceId}:${citation.page}`}
                source={source}
                page={citation.page}
                onOpen={() =>
                  setSelectedPage({ source, page: citation.page })
                }
              />
            );
          })}
        </div>
        {remainingCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-3 text-xs font-semibold text-[var(--accent)] underline underline-offset-2"
          >
            Show {remainingCount} more
          </button>
        )}
      </section>
      {selectedPage && (
        <PageModal
          source={selectedPage.source}
          page={selectedPage.page}
          onClose={closeModal}
        />
      )}
    </>
  );
}
