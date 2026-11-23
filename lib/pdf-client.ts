"use client";

import { getDocumentProxy } from "unpdf";
import type { PDFDocumentProxy } from "unpdf/pdfjs";

const MAX_FILE_BYTES = 150 * 1024 * 1024;
const MAX_PAGES = 2000;
const SELECTABLE_TEXT_ERROR =
  "This PDF has no selectable text (it may be scanned)";
const PAGE_LIMIT_ERROR = "This PDF has more than 2,000 pages";
const FILE_LIMIT_ERROR = "This PDF is larger than 150 MB";

function cleanPage(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function abortError() {
  return new DOMException("The PDF reading was cancelled.", "AbortError");
}

export async function readPdfPages(
  file: File,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<string[]> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(FILE_LIMIT_ERROR);
  }

  const header = new TextDecoder().decode(
    new Uint8Array(await file.slice(0, 5).arrayBuffer())
  );
  if (header !== "%PDF-") {
    throw new Error("This is not a readable PDF");
  }

  let pdf: PDFDocumentProxy | undefined;
  let destroyPromise: Promise<void> | undefined;
  let pages: string[] | undefined;
  let failure: unknown;
  const destroyPdf = () => {
    if (!pdf) return Promise.resolve();
    destroyPromise ??= pdf.destroy();
    return destroyPromise;
  };
  const handleAbort = () => {
    void destroyPdf().catch(() => undefined);
  };

  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    if (signal?.aborted) throw abortError();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (signal?.aborted) throw abortError();

    pdf = await getDocumentProxy(bytes);
    if (signal?.aborted) throw abortError();
    if (pdf.numPages > MAX_PAGES) {
      throw new Error(PAGE_LIMIT_ERROR);
    }

    const total = pdf.numPages;
    const extractedPages: string[] = [];
    let pagesWithText = 0;
    onProgress(0, total);

    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      if (signal?.aborted) throw abortError();
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const extracted = content.items
        .map((item) =>
          "str" in item ? `${item.str}${item.hasEOL ? "\n" : ""}` : ""
        )
        .join("");
      const cleaned = cleanPage(extracted);
      if (cleaned !== "") pagesWithText++;
      extractedPages.push(cleaned);
      page.cleanup();
      onProgress(pageNumber, total);
    }

    if (pagesWithText < 3) {
      throw new Error(SELECTABLE_TEXT_ERROR);
    }
    pages = extractedPages;
  } catch (error) {
    failure = error;
  } finally {
    signal?.removeEventListener("abort", handleAbort);
    try {
      await destroyPdf();
    } catch (error) {
      if (!failure) failure = error;
    }
  }

  if (signal?.aborted) throw abortError();
  if (failure) {
    if (
      failure instanceof Error &&
      (failure.message === SELECTABLE_TEXT_ERROR ||
        failure.message === PAGE_LIMIT_ERROR ||
        failure.message === FILE_LIMIT_ERROR)
    ) {
      throw failure;
    }
    throw new Error("This is not a readable PDF");
  }
  if (!pages) throw new Error("This is not a readable PDF");
  return pages;
}
