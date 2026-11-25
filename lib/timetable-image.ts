"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPageToCanvas } from "./pdf-render";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;
const MAX_TOTAL_BASE64_LENGTH = 3_500_000;

type TimetableImage = {
  mimeType: "image/jpeg";
  data: string;
};

type EncodeStep = {
  maxSide: number;
  quality: number;
};

const ENCODE_STEPS: EncodeStep[] = [
  { maxSide: 1600, quality: 0.8 },
  { maxSide: 1400, quality: 0.74 },
  { maxSide: 1200, quality: 0.68 },
  { maxSide: 1000, quality: 0.62 },
  { maxSide: 800, quality: 0.56 },
  { maxSide: 640, quality: 0.5 },
  { maxSide: 480, quality: 0.42 },
];

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function fillWithThemeSurface(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
) {
  const surface = getComputedStyle(document.documentElement)
    .getPropertyValue("--surface")
    .trim();
  if (!surface) throw new Error("Could not prepare this image.");
  context.fillStyle = surface;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawImageToCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxSide: number
): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = makeCanvas(
    Math.max(1, Math.round(sourceWidth * scale)),
    Math.max(1, Math.round(sourceHeight * scale))
  );
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare this image.");
  fillWithThemeSurface(context, canvas);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function encodeCanvas(
  source: HTMLCanvasElement,
  step: EncodeStep
): TimetableImage {
  const scale = Math.min(1, step.maxSide / Math.max(source.width, source.height));
  const canvas = makeCanvas(
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale))
  );
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare this image.");
  fillWithThemeSurface(context, canvas);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  try {
    const dataUrl = canvas.toDataURL("image/jpeg", step.quality);
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (!data) throw new Error("Could not encode this image.");
    return { mimeType: "image/jpeg", data };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function loadImageCanvas(file: File): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot read that image. Try another browser.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Could not read that image. Try another file.");
  }
  try {
    if (bitmap.width < 1 || bitmap.height < 1) {
      throw new Error("This image has no readable dimensions.");
    }
    return drawImageToCanvas(
      bitmap,
      bitmap.width,
      bitmap.height,
      MAX_IMAGE_SIDE
    );
  } finally {
    bitmap.close();
  }
}

async function loadPdfCanvases(file: File): Promise<HTMLCanvasElement[]> {
  let pdf: PDFDocumentProxy | null = null;
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
    }).promise;
    if (pdf.numPages < 1) throw new Error("This PDF has no pages.");

    const canvases: HTMLCanvasElement[] = [];
    const pageCount = Math.min(pdf.numPages, 3);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const targetWidth =
        (viewport.width * MAX_IMAGE_SIDE) /
        Math.max(viewport.width, viewport.height) /
        pixelRatio;

      const canvas = document.createElement("canvas");
      await renderPageToCanvas(pdf, pageNumber, canvas, targetWidth);
      canvases.push(canvas);
    }
    return canvases;
  } catch (error) {
    if (error instanceof Error && error.message === "This PDF has no pages.") {
      throw error;
    }
    throw new Error("Could not read that PDF. Try another file.");
  } finally {
    await pdf?.destroy();
  }
}

export async function prepareTimetableFiles(
  file: File
): Promise<{ images: TimetableImage[] }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is larger than 10 MB.");
  }

  const fileName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || fileName.endsWith(".pdf");
  const isImage =
    ["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    (file.type === "" &&
      [".png", ".jpg", ".jpeg", ".webp"].some((extension) =>
        fileName.endsWith(extension)
      ));
  if (!isPdf && !isImage) {
    throw new Error("Choose a PNG, JPEG, WEBP image or PDF file.");
  }

  const canvases = isPdf
    ? await loadPdfCanvases(file)
    : [await loadImageCanvas(file)];
  try {
    for (const step of ENCODE_STEPS) {
      const images = canvases.map((canvas) => encodeCanvas(canvas, step));
      const totalLength = images.reduce(
        (total, image) => total + image.data.length,
        0
      );
      if (totalLength < MAX_TOTAL_BASE64_LENGTH) return { images };
    }
  } finally {
    for (const canvas of canvases) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  throw new Error("That file is too large. Crop it or use fewer pages.");
}
