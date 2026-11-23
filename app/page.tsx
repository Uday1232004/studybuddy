"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import History, { type SavedKit } from "./History";
import {
  type ChatMessage,
  type ChatRestoreSession,
} from "./components/ChatPanel";
import MobileTabs, { type TabName } from "./components/MobileTabs";
import TopBar from "./components/TopBar";
import Workspace, { type Source } from "./components/Workspace";
import { readPdfPages } from "../lib/pdf-client";

const MAX_FILE_BYTES = 150 * 1024 * 1024;
const MAX_PDF_PAGES = 2000;
const MAX_SOURCES = 20;
const INDEX_BATCH_PAGES = 10;
const DAILY_QUOTA_MESSAGE =
  "The daily Gemini embedding limit is used up. Try again tomorrow, or enable billing for the Gemini key.";
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

type SourceIndexWork = {
  pages: string[];
  startPage: number | null;
  offset: number;
  first: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default function Home() {
  const [sources, setSources] = useState<Source[]>([]);
  const sourcesRef = useRef<Source[]>([]);
  const sourceIndexWorkRef = useRef<Map<string, SourceIndexWork>>(new Map());
  const sourceControllersRef = useRef<Map<string, AbortController>>(new Map());
  const pdfQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sourceGenerationRef = useRef(0);
  const dailyQuotaStopRef = useRef(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const currentChatIdRef = useRef<string | null>(null);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const [restoreSession, setRestoreSession] = useState<ChatRestoreSession>({
    key: 0,
    messages: [],
  });
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const restoredSourcesRef = useRef<Source[] | null>(null);
  const chatSessionGenerationRef = useRef(0);
  const chatSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [sourceMessage, setSourceMessage] = useState("");
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>("Workspace");
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);

  function replaceSources(nextSources: Source[]) {
    sourcesRef.current = nextSources;
    setSources(nextSources);
  }

  function cancelSourceWork() {
    sourceGenerationRef.current += 1;
    for (const controller of sourceControllersRef.current.values()) {
      controller.abort();
    }
    sourceControllersRef.current.clear();
    sourceIndexWorkRef.current.clear();
  }

  const queueChatSave = useCallback((nextMessages: ChatMessage[]) => {
    const savedMessages = nextMessages
      .filter(
        (message) =>
          !message.hidden && message.content !== "START_LESSON"
      )
      .slice(-200)
      .map(({ role, content }) => ({ role, content }));
    if (savedMessages.length === 0) return;

    const savedSources = sourcesRef.current
      .filter((source) => !source.status && !source.error)
      .map((source) => ({
        id: source.id,
        name: source.name.slice(0, 120),
        type: source.type,
        enabled: source.enabled,
        ...(typeof source.pages === "number" ? { pages: source.pages } : {}),
      }));
    const title =
      savedSources.find((source) => source.enabled)?.name ??
      savedSources[0]?.name ??
      "Untitled chat";
    const payload = JSON.stringify({
      title,
      sources: savedSources,
      messages: savedMessages,
    });
    const generation = chatSessionGenerationRef.current;

    const save = async () => {
      if (generation !== chatSessionGenerationRef.current) return;

      const id = currentChatIdRef.current;
      const response = await fetch(
        id ? `/api/history/${encodeURIComponent(id)}` : "/api/history",
        {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        }
      );
      if (!response.ok) {
        throw new Error(`Chat history request failed with status ${response.status}.`);
      }

      const data: unknown = await response.json();
      if (!isRecord(data) || typeof data.id !== "string") {
        throw new Error("The chat history response did not include an ID.");
      }
      if (generation !== chatSessionGenerationRef.current) return;

      if (!id) {
        currentChatIdRef.current = data.id;
        setCurrentChatId(data.id);
        setActiveHistoryId(data.id);
      }
      setHistoryRefreshKey((key) => key + 1);
    };

    chatSaveQueueRef.current = chatSaveQueueRef.current
      .then(save)
      .catch((error: unknown) => {
        console.error("Could not save chat history:", error);
      });
  }, []);

  const handleChatMessagesChange = useCallback((messages: ChatMessage[]) => {
    chatMessagesRef.current = messages;
  }, []);

  const handleAssistantReply = useCallback(
    (messages: ChatMessage[]) => queueChatSave(messages),
    [queueChatSave]
  );

  useEffect(() => {
    if (restoredSourcesRef.current === sources) return;
    const hasSavedMessages = chatMessagesRef.current.some(
      (message) => !message.hidden && message.content !== "START_LESSON"
    );
    if (!currentChatIdRef.current || !hasSavedMessages) return;

    const timeout = setTimeout(
      () => queueChatSave(chatMessagesRef.current),
      1000
    );
    return () => clearTimeout(timeout);
  }, [queueChatSave, sources]);

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
    const restoredMessages = kit.messages ?? [];
    const hasMessages = restoredMessages.length > 0;
    const metadataSources: Source[] = (kit.sources ?? []).flatMap((source) => {
      const value: unknown = source;
      if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        !UUID_PATTERN.test(value.id) ||
        typeof value.name !== "string" ||
        (value.type !== "pdf" && value.type !== "text") ||
        typeof value.enabled !== "boolean" ||
        (value.pages !== undefined &&
          (typeof value.pages !== "number" ||
            !Number.isFinite(value.pages) ||
            value.pages < 0))
      ) {
        return [];
      }

      return [
        {
          id: value.id,
          type: value.type,
          name: value.name,
          preview: "",
          enabled: value.enabled,
          ...(typeof value.pages === "number" ? { pages: value.pages } : {}),
        },
      ];
    });
    const savedNotesText =
      metadataSources.length === 0 ? kit.notes.trim() : "";
    const savedNotesSource: Source | null =
      savedNotesText === ""
        ? null
        : {
            id: crypto.randomUUID(),
            type: "text",
            name: "Saved notes",
            preview: savedNotesText.slice(0, 2000),
            enabled: true,
            pages: 1,
            status: "indexing",
            progress: { start: 1, end: 1, total: 1 },
          };
    const nextSources = savedNotesSource
      ? [savedNotesSource]
      : metadataSources;

    chatSessionGenerationRef.current += 1;
    cancelSourceWork();
    const chatId = hasMessages ? kit.id : null;
    currentChatIdRef.current = chatId;
    setCurrentChatId(chatId);
    chatMessagesRef.current = restoredMessages;
    restoredSourcesRef.current = nextSources;
    setRestoreSession((current) => ({
      key: current.key + 1,
      messages: restoredMessages,
    }));
    setActiveHistoryId(kit.id);
    replaceSources(nextSources);
    setSourceMessage("");
    setActiveTab("Workspace");
    if (savedNotesSource) {
      const work: SourceIndexWork = {
        pages: [savedNotesText],
        startPage: null,
        offset: 0,
        first: true,
      };
      sourceIndexWorkRef.current.set(savedNotesSource.id, work);
      startSourceIndexing(savedNotesSource.id, savedNotesSource.name, work);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNewNotes() {
    chatSessionGenerationRef.current += 1;
    cancelSourceWork();
    currentChatIdRef.current = null;
    setCurrentChatId(null);
    chatMessagesRef.current = [];
    setRestoreSession((current) => ({
      key: current.key + 1,
      messages: [],
    }));
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
  }

  function handleRemoveSource(id: string) {
    sourceControllersRef.current.get(id)?.abort();
    sourceControllersRef.current.delete(id);
    sourceIndexWorkRef.current.delete(id);
    replaceSources(sourcesRef.current.filter((source) => source.id !== id));
  }

  function stopIndexingForDailyQuota(failedId: string, message: string) {
    dailyQuotaStopRef.current = true;
    for (const [id, controller] of sourceControllersRef.current) {
      if (id !== failedId) controller.abort();
    }

    for (const source of sourcesRef.current) {
      if (source.id !== failedId && source.status) {
        updateSource(source.id, {
          status: undefined,
          progress: undefined,
          error: message,
          errorDetail: undefined,
          retryable: false,
        });
      }
    }

    sourceIndexWorkRef.current.delete(failedId);
    updateSource(failedId, {
      status: undefined,
      progress: undefined,
      error: message,
      errorDetail: undefined,
      retryable: false,
    });
  }

  async function indexSourceBatches(
    id: string,
    name: string,
    work: SourceIndexWork,
    controller: AbortController
  ) {
    for (
      let offset = work.offset;
      offset < work.pages.length;
      offset += INDEX_BATCH_PAGES
    ) {
      if (controller.signal.aborted || dailyQuotaStopRef.current) return;

      const batch = work.pages.slice(offset, offset + INDEX_BATCH_PAGES);
      const first = offset === work.offset ? work.first : false;
      const startPage =
        work.startPage === null ? null : work.startPage + offset;
      const progressStart = startPage ?? offset + 1;
      const progressEnd =
        startPage === null ? offset + batch.length : startPage + batch.length - 1;
      updateSource(id, {
        status: "indexing",
        progress: {
          start: progressStart,
          end: progressEnd,
          total: work.pages.length,
        },
        error: undefined,
        errorDetail: undefined,
        retryable: false,
      });

      let failureMessage = "";
      let indexed = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
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
            signal: controller.signal,
          });
          let data: unknown = null;
          try {
            data = await response.json();
          } catch {
            data = null;
          }

          if (isRecord(data) && data.code === "DAILY_QUOTA") {
            const message =
              typeof data.error === "string"
                ? data.error
                : DAILY_QUOTA_MESSAGE;
            stopIndexingForDailyQuota(id, message);
            return;
          }

          if (!response.ok) {
            const message =
              isRecord(data) && typeof data.detail === "string"
                ? data.detail
                : isRecord(data) && typeof data.error === "string"
                  ? data.error
                  : `Indexing request failed with status ${response.status}.`;
            throw new Error(message);
          }
          if (!isRecord(data) || typeof data.chunks !== "number") {
            throw new Error("The indexing response was not valid.");
          }
          indexed = true;
          break;
        } catch (error) {
          if (controller.signal.aborted) return;
          failureMessage =
            error instanceof Error ? error.message : String(error);
        }
      }

      if (!indexed) {
        sourceIndexWorkRef.current.set(id, {
          ...work,
          offset,
          first,
        });
        const failedPage = startPage ?? offset + 1;
        updateSource(id, {
          status: undefined,
          progress: undefined,
          error: `Indexing failed at page ${failedPage}`,
          errorDetail:
            process.env.NODE_ENV !== "production" ? failureMessage : undefined,
          retryable: true,
        });
        return;
      }
    }

    sourceIndexWorkRef.current.delete(id);
    updateSource(id, {
      status: undefined,
      progress: undefined,
      error: undefined,
      errorDetail: undefined,
      retryable: false,
    });
  }

  function handleRetrySource(id: string) {
    if (dailyQuotaStopRef.current) return;
    const source = sourcesRef.current.find((item) => item.id === id);
    const work = sourceIndexWorkRef.current.get(id);
    if (!source || !work) return;

    startSourceIndexing(id, source.name, work);
  }

  function startSourceIndexing(
    id: string,
    name: string,
    work: SourceIndexWork
  ) {
    if (dailyQuotaStopRef.current) {
      updateSource(id, {
        status: undefined,
        progress: undefined,
        error: DAILY_QUOTA_MESSAGE,
        errorDetail: undefined,
        retryable: false,
      });
      return;
    }

    const controller = new AbortController();
    sourceControllersRef.current.set(id, controller);
    void indexSourceBatches(id, name, work, controller).finally(() => {
      if (sourceControllersRef.current.get(id) === controller) {
        sourceControllersRef.current.delete(id);
      }
    });
  }

  function handleAddTextSource(name: string, text: string) {
    if (sourcesRef.current.length >= MAX_SOURCES) {
      setSourceMessage("You can add up to 20 sources.");
      return false;
    }

    const id = crypto.randomUUID();
    const sourceName = uniqueSourceName(name);
    const pages = [text];
    const source: Source = {
      id,
      type: "text",
      name: sourceName,
      preview: text.slice(0, 2000),
      enabled: true,
      pages: 1,
      status: "indexing",
      progress: { start: 1, end: 1, total: 1 },
    };
    const work: SourceIndexWork = {
      pages,
      startPage: null,
      offset: 0,
      first: true,
    };
    sourceIndexWorkRef.current.set(id, work);
    replaceSources([...sourcesRef.current, source]);
    setSourceMessage("");
    startSourceIndexing(id, sourceName, work);
    return true;
  }

  function handleHistoryItemsDeleted(ids: string[]) {
    const currentChatDeleted =
      currentChatId !== null && ids.includes(currentChatId);
    const activeHistoryDeleted =
      activeHistoryId !== null && ids.includes(activeHistoryId);
    if (currentChatDeleted || activeHistoryDeleted) {
      chatSessionGenerationRef.current += 1;
      cancelSourceWork();
      currentChatIdRef.current = null;
      setCurrentChatId(null);
      chatMessagesRef.current = [];
      setRestoreSession((current) => ({
        key: current.key + 1,
        messages: [],
      }));
      setActiveHistoryId(null);
      replaceSources([]);
      setSourceMessage("");
    }
  }

  async function processPdfFile(file: File) {
    if (sourcesRef.current.length >= MAX_SOURCES) {
      setSourceMessage("You can add up to 20 sources.");
      return;
    }

    const id = crypto.randomUUID();
    const name = uniqueSourceName(file.name);
    const source: Source = {
      id,
      type: "pdf",
      name,
      preview: "",
      enabled: true,
      status: "reading",
      progress: { start: 0, end: 0, total: 0 },
    };
    replaceSources([...sourcesRef.current, source]);
    setSourceMessage("");

    if (file.size > MAX_FILE_BYTES) {
      updateSource(id, {
        status: undefined,
        progress: undefined,
        error: "That PDF is too large. Please use a file under 150 MB.",
      });
      return;
    }

    const controller = new AbortController();
    sourceControllersRef.current.set(id, controller);
    try {
      const pages = await readPdfPages(
        file,
        (done, total) => {
          if (controller.signal.aborted) return;
          updateSource(id, {
            status: "reading",
            progress: { start: done, end: done, total },
          });
        },
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (dailyQuotaStopRef.current) {
        updateSource(id, {
          status: undefined,
          progress: undefined,
          error: DAILY_QUOTA_MESSAGE,
          errorDetail: undefined,
          retryable: false,
        });
        return;
      }
      if (pages.length > MAX_PDF_PAGES) return;
      if (!sourcesRef.current.some((source) => source.id === id)) return;

      const work: SourceIndexWork = {
        pages,
        startPage: 1,
        offset: 0,
        first: true,
      };
      sourceIndexWorkRef.current.set(id, work);
      updateSource(id, {
        preview: pages.join("\n\n").slice(0, 2000),
        pages: pages.length,
        status: "indexing",
        progress: {
          start: 1,
          end: Math.min(INDEX_BATCH_PAGES, pages.length),
          total: pages.length,
        },
      });
      await indexSourceBatches(id, name, work, controller);
    } catch (error) {
      if (controller.signal.aborted) return;
      updateSource(id, {
        status: undefined,
        progress: undefined,
        error:
          error instanceof Error
            ? error.message
            : "This is not a readable PDF",
        errorDetail: undefined,
        retryable: false,
      });
    } finally {
      if (sourceControllersRef.current.get(id) === controller) {
        sourceControllersRef.current.delete(id);
      }
    }
  }

  function addPdfFiles(files: File[]) {
    const queuedFiles = [...files];
    const generation = sourceGenerationRef.current;
    pdfQueueRef.current = pdfQueueRef.current.then(async () => {
      for (const file of queuedFiles) {
        if (
          generation !== sourceGenerationRef.current ||
          dailyQuotaStopRef.current
        ) {
          return;
        }
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
              refreshKey={historyRefreshKey}
              onSelect={handleSelect}
              onItemsDeleted={handleHistoryItemsDeleted}
            />
          </div>
        </aside>
        <section
          className={`${activeTab === "Workspace" ? "flex" : "hidden"} min-h-0 flex-col overflow-y-auto lg:flex`}
        >
          <Workspace
            restoreSession={restoreSession}
            onMessagesChange={handleChatMessagesChange}
            onAssistantReply={handleAssistantReply}
            sources={sources}
            sourceMessage={sourceMessage}
            uploadingPdf={sources.some(
              (source) =>
                source.type === "pdf" && source.status !== undefined
            )}
            isDraggingPdf={isDraggingPdf}
            onPdfFileSelect={handlePdfFile}
            onAddPdfFiles={addPdfFiles}
            onAddTextSource={handleAddTextSource}
            onRetrySource={handleRetrySource}
            onToggleSource={handleToggleSource}
            onRemoveSource={handleRemoveSource}
            onPdfDragStateChange={setIsDraggingPdf}
          />
        </section>
      </main>
    </div>
  );
}
