import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { createClient } from "./supabase/client";

export type PdfSource = {
  id: string;
  name: string;
  filePath: string;
  pages?: number;
};

type CachedPdf = {
  filePath: string;
  promise: Promise<PDFDocumentProxy>;
};

const pdfCache = new Map<string, CachedPdf>();
const activeRenderTasks = new WeakMap<HTMLCanvasElement, RenderTask>();
const renderVersions = new WeakMap<HTMLCanvasElement, number>();

async function createSignedUrl(source: PdfSource): Promise<string> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("pdfs")
      .createSignedUrl(source.filePath, 3600);
    if (error || !data?.signedUrl) {
      throw new Error("Could not load the PDF");
    }
    return data.signedUrl;
  } catch {
    throw new Error("Could not load the PDF");
  }
}

export function getPdfUrlForSource(source: PdfSource): Promise<string> {
  return createSignedUrl(source);
}

export async function getPdfForSource(
  source: PdfSource
): Promise<PDFDocumentProxy> {
  const cached = pdfCache.get(source.id);
  if (cached?.filePath === source.filePath) {
    try {
      return await cached.promise;
    } catch {
      if (pdfCache.get(source.id) === cached) {
        pdfCache.delete(source.id);
      }
      throw new Error("Could not load the PDF");
    }
  }

  const entry: CachedPdf = {
    filePath: source.filePath,
    promise: (async () => {
      try {
        const [pdfjs, url] = await Promise.all([
          import("pdfjs-dist"),
          createSignedUrl(source),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        return await pdfjs.getDocument({
          url,
          rangeChunkSize: 64 * 1024,
          disableStream: true,
          disableAutoFetch: true,
          isEvalSupported: false,
        }).promise;
      } catch {
        throw new Error("Could not load the PDF");
      }
    })(),
  };
  pdfCache.set(source.id, entry);

  try {
    return await entry.promise;
  } catch {
    if (pdfCache.get(source.id) === entry) {
      pdfCache.delete(source.id);
    }
    throw new Error("Could not load the PDF");
  }
}

export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  targetWidth: number
): Promise<void> {
  const version = (renderVersions.get(canvas) ?? 0) + 1;
  renderVersions.set(canvas, version);
  activeRenderTasks.get(canvas)?.cancel();

  try {
    if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
      throw new Error("Invalid page width");
    }
    const page = await pdf.getPage(pageNumber);
    if (renderVersions.get(canvas) !== version) return;

    const initialViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / initialViewport.width;
    const viewport = page.getViewport({ scale });
    const pixelRatio =
      typeof window === "undefined"
        ? 1
        : Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.ceil(viewport.width * pixelRatio);
    canvas.height = Math.ceil(viewport.height * pixelRatio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable");

    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const task = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform:
        pixelRatio === 1
          ? undefined
          : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      background: "rgb(255, 255, 255)",
    });
    activeRenderTasks.set(canvas, task);
    await task.promise;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "RenderingCancelledException"
    ) {
      return;
    }
    if (renderVersions.get(canvas) === version) {
      throw new Error("Could not draw this page");
    }
  } finally {
    if (renderVersions.get(canvas) === version) {
      activeRenderTasks.delete(canvas);
    }
  }
}
