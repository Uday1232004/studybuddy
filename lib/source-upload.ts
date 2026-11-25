"use client";

import { createClient } from "./supabase/client";
import { readPdfPages } from "./pdf-client";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 2000;
const INDEX_BATCH_PAGES = 10;
const DAILY_QUOTA_MESSAGE =
  "The daily Gemini embedding limit is used up. Try again tomorrow, or enable billing for the Gemini key.";

type AddPdfSourceOptions = {
  onStatus: (text: string) => void;
  signal?: AbortSignal;
};

export type UploadedPdfSource = {
  id: string;
  type: "pdf";
  name: string;
  enabled: true;
  pages: number;
  filePath: string | null;
  fileSize: number;
};

function abortError(): DOMException {
  return new DOMException("The PDF upload was cancelled.", "AbortError");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function addPdfSource(
  file: File,
  opts: AddPdfSourceOptions
): Promise<UploadedPdfSource> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("This file is over 50 MB, the current storage limit.");
  }
  if (opts.signal?.aborted) throw abortError();

  const id = crypto.randomUUID();
  const name = file.name.trim().slice(0, 120) || "Uploaded PDF";
  const supabase = createClient();
  let filePath: string | null = null;
  let uploadFailure: string | null = null;

  opts.onStatus("Saving original...");
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);
    const userId = authData.user?.id;
    if (!userId) throw new Error("Please sign in to save the original PDF.");

    const candidatePath = `${userId}/${id}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("pdfs")
      .upload(candidatePath, file, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);
    filePath = candidatePath;
  } catch (error) {
    uploadFailure = errorMessage(error, "Could not save the original PDF.");
    opts.onStatus(
      `Original could not be saved: ${uploadFailure}. Continuing without a saved copy.`
    );
  }

  if (opts.signal?.aborted) {
    if (filePath) {
      const { error: cleanupError } = await supabase.storage
        .from("pdfs")
        .remove([filePath]);
      if (cleanupError) {
        throw new Error(
          `The upload was cancelled, but its original PDF could not be removed: ${cleanupError.message}`
        );
      }
    }
    throw abortError();
  }

  try {
    const pages = await readPdfPages(
      file,
      (done, total) => opts.onStatus(`Reading page ${done} of ${total}`),
      opts.signal
    );
    if (pages.length > MAX_PDF_PAGES) {
      throw new Error("This PDF has more than 2,000 pages.");
    }

    for (let offset = 0; offset < pages.length; offset += INDEX_BATCH_PAGES) {
      if (opts.signal?.aborted) throw abortError();
      const batch = pages.slice(offset, offset + INDEX_BATCH_PAGES);
      const startPage = offset + 1;
      const endPage = offset + batch.length;
      const first = offset === 0;
      opts.onStatus(
        `Indexing pages ${startPage}-${endPage} of ${pages.length}`
      );

      let indexed = false;
      let lastFailure = "Could not index this file. Try again.";
      for (let attempt = 0; attempt < 2; attempt++) {
        if (opts.signal?.aborted) throw abortError();
        const response = await fetch("/api/sources/index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceId: id,
            name,
            pages: batch,
            startPage,
            first,
          }),
          signal: opts.signal,
        });
        const data = await readJson(response);

        if (
          typeof data === "object" &&
          data !== null &&
          "code" in data &&
          (data.code === "DAILY_QUOTA" || data.code === "RATE_LIMIT")
        ) {
          const message =
            "error" in data && typeof data.error === "string"
              ? data.error
              : data.code === "DAILY_QUOTA"
                ? DAILY_QUOTA_MESSAGE
                : "Daily PDF upload limit reached. Try again later.";
          const quotaError = new Error(message);
          quotaError.name = "DailyQuotaError";
          throw quotaError;
        }

        if (!response.ok) {
          lastFailure =
            typeof data === "object" &&
            data !== null &&
            "detail" in data &&
            typeof data.detail === "string"
              ? data.detail
              : typeof data === "object" &&
                  data !== null &&
                  "error" in data &&
                  typeof data.error === "string"
                ? data.error
                : `Indexing request failed with status ${response.status}.`;
          continue;
        }
        if (
          typeof data !== "object" ||
          data === null ||
          !("chunks" in data) ||
          typeof data.chunks !== "number"
        ) {
          lastFailure = "The indexing response was not valid.";
          continue;
        }
        indexed = true;
        break;
      }

      if (!indexed) throw new Error(lastFailure);
    }

    if (opts.signal?.aborted) throw abortError();
    opts.onStatus("PDF indexed.");
    return {
      id,
      type: "pdf",
      name,
      enabled: true,
      pages: pages.length,
      filePath,
      fileSize: file.size,
    };
  } catch (error) {
    const cleanupFailures: string[] = [];
    const { error: chunkCleanupError } = await supabase
      .from("source_chunks")
      .delete()
      .eq("source_id", id);
    if (chunkCleanupError) {
      cleanupFailures.push(
        `Could not remove partial search data: ${chunkCleanupError.message}`
      );
    }
    if (filePath) {
      const { error: fileCleanupError } = await supabase.storage
        .from("pdfs")
        .remove([filePath]);
      if (fileCleanupError) {
        cleanupFailures.push(
          `Could not remove the uploaded original: ${fileCleanupError.message}`
        );
      }
    }
    const originalMessage = errorMessage(error, "Could not process this PDF.");
    if (cleanupFailures.length > 0) {
      throw new Error(`${originalMessage} ${cleanupFailures.join(" ")}`);
    }
    throw error;
  }
}
