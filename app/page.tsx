"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import History, { type SavedKit } from "./History";
import {
  type ChatMessage,
  type ChatRestoreSession,
} from "./components/ChatPanel";
import MobileTabs, { type TabName } from "./components/MobileTabs";
import AppNav from "./components/AppNav";
import Workspace, { type Source } from "./components/Workspace";
import { readPdfPages } from "../lib/pdf-client";
import { createClient as createBrowserClient } from "../lib/supabase/client";
import {
  buildLearnUrl,
  parseLearnParams,
  type LearnParams,
} from "../lib/learn-link";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "../lib/limits";
import { markTaskDone } from "../lib/task-done";

const MAX_FILE_ERROR = "This file is over 50 MB, the current storage limit.";
const MAX_SOURCES = 20;
const INDEX_BATCH_PAGES = 10;
const PRIMARY_ACTION_CLASS =
  "inline-flex min-h-9 items-center justify-center rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY_ACTION_CLASS =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60";
const DAILY_QUOTA_MESSAGE =
  "The daily Gemini embedding limit is used up. Try again tomorrow, or enable billing for the Gemini key.";
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FILE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;

type SourceIndexWork = {
  pages: string[];
  startPage: number | null;
  offset: number;
  first: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type StudyTaskRow = {
  id: string | number;
  plan_id: string | null;
  exam_id: string;
  module: string | null;
  pages: string | null;
  task_date: string;
  position: number;
  done: boolean;
};

function parseStudyTask(value: unknown): StudyTaskRow | null {
  if (
    !isRecord(value) ||
    !(typeof value.id === "string" || typeof value.id === "number") ||
    !(typeof value.plan_id === "string" || value.plan_id === null) ||
    typeof value.exam_id !== "string" ||
    !(typeof value.module === "string" || value.module === null) ||
    !(typeof value.pages === "string" || value.pages === null) ||
    typeof value.task_date !== "string" ||
    typeof value.position !== "number" ||
    typeof value.done !== "boolean"
  ) {
    return null;
  }
  return {
    id: value.id,
    plan_id: value.plan_id,
    exam_id: value.exam_id,
    module: value.module,
    pages: value.pages,
    task_date: value.task_date.slice(0, 10),
    position: value.position,
    done: value.done,
  };
}

function parseTaskPageRange(pages: string | null): {
  pageStart: number | null;
  pageEnd: number | null;
} {
  if (!pages) return { pageStart: null, pageEnd: null };
  const numbers = Array.from(pages.matchAll(/\d+/g), (match) =>
    Number(match[0])
  ).filter((number) => Number.isInteger(number) && number > 0);
  if (numbers.length === 0) return { pageStart: null, pageEnd: null };
  return {
    pageStart: numbers[0],
    pageEnd: numbers.length > 1 ? numbers[numbers.length - 1] : numbers[0],
  };
}

async function findNextTopicUrl(
  params: LearnParams
): Promise<{ url: string | null; status: string; error: string | null }> {
  if (!params.taskId) {
    return { url: null, status: "", error: null };
  }
  try {
    const supabase = createBrowserClient();
    const { data: currentData, error: currentError } = await supabase
      .from("plan_tasks")
      .select("id, plan_id, exam_id, module, pages, task_date, position, done")
      .eq("id", params.taskId)
      .maybeSingle();
    if (currentError) {
      return { url: null, status: "", error: currentError.message };
    }
    const current = parseStudyTask(currentData);
    if (!current || current.plan_id === null) {
      return { url: null, status: "", error: null };
    }

    const { data, error } = await supabase
      .from("plan_tasks")
      .select("id, plan_id, exam_id, module, pages, task_date, position, done")
      .eq("plan_id", current.plan_id)
      .eq("exam_id", current.exam_id)
      .order("task_date", { ascending: true })
      .order("position", { ascending: true });
    if (error) return { url: null, status: "", error: error.message };

    const rows: StudyTaskRow[] = [];
    if (Array.isArray(data)) {
      for (const item of data) {
        const row = parseStudyTask(item);
        if (row) rows.push(row);
      }
    }
    const currentIndex = rows.findIndex(
      (row) => String(row.id) === String(params.taskId)
    );
    const following = rows
      .slice(currentIndex >= 0 ? currentIndex + 1 : 0)
      .find((row) => !row.done);
    if (!following || !following.module?.trim()) {
      return {
        url: null,
        status: "All topics in this plan are done.",
        error: null,
      };
    }

    const pageRange = parseTaskPageRange(following.pages);
    return {
      url: buildLearnUrl({
        chatId: params.chatId,
        moduleName: following.module.trim(),
        pageStart: pageRange.pageStart,
        pageEnd: pageRange.pageEnd,
        topic: null,
        taskId: String(following.id),
      }),
      status: "",
      error: null,
    };
  } catch (error) {
    return {
      url: null,
      status: "",
      error:
        error instanceof Error
          ? error.message
          : "Could not find the next topic.",
    };
  }
}

export default function Home() {
  const [sources, setSources] = useState<Source[]>([]);
  const sourcesRef = useRef<Source[]>([]);
  const sourceIndexWorkRef = useRef<Map<string, SourceIndexWork>>(new Map());
  const sourceControllersRef = useRef<Map<string, AbortController>>(new Map());
  const sourceTasksRef = useRef<Map<string, Promise<void>>>(new Map());
  const sourceFilePathsRef = useRef<Map<string, string>>(new Map());
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
  const [learnBanner, setLearnBanner] = useState("");
  const [learnError, setLearnError] = useState("");
  const learnStartedRef = useRef(false);
  const testMeStartedRef = useRef(false);
  const [learnParams, setLearnParams] = useState<LearnParams | null>(null);
  const [taskDone, setTaskDone] = useState(false);
  const [taskDoneSaving, setTaskDoneSaving] = useState(false);
  const [taskDoneError, setTaskDoneError] = useState("");
  const [nextTopicUrl, setNextTopicUrl] = useState<string | null>(null);
  const [nextTopicStatus, setNextTopicStatus] = useState("");
  const [testMeSaving, setTestMeSaving] = useState(false);

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
        filePath: source.filePath,
        fileSize: source.fileSize,
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
          filePath:
            typeof value.filePath === "string" &&
            value.filePath.length <= 200 &&
            FILE_PATH_PATTERN.test(value.filePath) &&
            value.filePath.endsWith(`/${value.id}.pdf`)
              ? value.filePath
              : null,
          fileSize:
            typeof value.fileSize === "number" &&
            Number.isFinite(value.fileSize) &&
            value.fileSize >= 0
              ? value.fileSize
              : 0,
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
            filePath: null,
            fileSize: 0,
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
    for (const source of nextSources) {
      if (source.filePath) {
        sourceFilePathsRef.current.set(source.id, source.filePath);
      }
    }
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

  useEffect(() => {
    if (learnStartedRef.current) return;
    const params = parseLearnParams(new URLSearchParams(window.location.search));
    if (!params) return;

    learnStartedRef.current = true;
    void (async () => {
      setLearnError("");
      setLearnBanner("");
      setLearnParams(params);
      setTaskDone(false);
      setTaskDoneSaving(false);
      setTaskDoneError("");
      setNextTopicUrl(null);
      setNextTopicStatus("");
      testMeStartedRef.current = false;

      if (params.taskId) {
        const supabase = createBrowserClient();
        const { data, error } = await supabase
          .from("plan_tasks")
          .select("id, plan_id, exam_id, module, pages, task_date, position, done")
          .eq("id", params.taskId)
          .maybeSingle();
        if (error) {
          setTaskDoneError(error.message);
        } else {
          const task = parseStudyTask(data);
          setTaskDone(task?.done ?? false);
        }
      }

      const response = await fetch(
        `/api/history/${encodeURIComponent(params.chatId)}`
      );
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const message =
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Could not open this saved chat.";
        setLearnError(message);
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
      if (
        !isRecord(payload) ||
        typeof payload.id !== "string" ||
        !Array.isArray(payload.sources) ||
        !Array.isArray(payload.messages)
      ) {
        setLearnError("Could not open this saved chat.");
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      const restoredSources: Source[] = payload.sources.flatMap((source) => {
        if (
          !isRecord(source) ||
          typeof source.id !== "string" ||
          !UUID_PATTERN.test(source.id) ||
          typeof source.name !== "string" ||
          (source.type !== "pdf" && source.type !== "text") ||
          typeof source.enabled !== "boolean"
        ) {
          return [];
        }
        return [
          {
            id: source.id,
            type: source.type,
            name: source.name,
            preview: "",
            enabled: source.enabled,
            filePath:
              typeof source.filePath === "string" &&
              source.filePath.length <= 200 &&
              FILE_PATH_PATTERN.test(source.filePath) &&
              source.filePath.endsWith(`/${source.id}.pdf`)
                ? source.filePath
                : null,
            fileSize:
              typeof source.fileSize === "number" &&
              Number.isFinite(source.fileSize) &&
              source.fileSize >= 0
                ? source.fileSize
                : 0,
            ...(typeof source.pages === "number"
              ? { pages: source.pages }
              : {}),
          },
        ];
      });
      chatSessionGenerationRef.current += 1;
      cancelSourceWork();
      const restoredMessages: ChatMessage[] = payload.messages.flatMap(
        (message): ChatMessage[] =>
        isRecord(message) &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
          ? [{ role: message.role, content: message.content }]
          : []
      );
      currentChatIdRef.current = payload.id;
      setCurrentChatId(payload.id);
      chatMessagesRef.current = restoredMessages;
      restoredSourcesRef.current = restoredSources;
      for (const source of restoredSources) {
        if (source.filePath) {
          sourceFilePathsRef.current.set(source.id, source.filePath);
        }
      }
      setRestoreSession((current) => ({
        key: current.key + 1,
        messages: restoredMessages,
      }));
      setActiveHistoryId(payload.id);
      replaceSources(restoredSources);
      setSourceMessage("");
      setActiveTab("Workspace");

      const matchingSource = sourcesRef.current.find(
        (source) =>
          source.type === "pdf" && source.name === params.moduleName
      );
      if (!matchingSource) {
        setLearnError(
          `Could not find the PDF "${params.moduleName}" in this saved chat.`
        );
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      replaceSources(
        sourcesRef.current.map((source) => ({
          ...source,
          enabled: source.id === matchingSource.id,
        }))
      );

      const range =
        params.pageStart !== null && params.pageEnd !== null
          ? params.pageStart === params.pageEnd
            ? `page ${params.pageStart}`
            : `pages ${params.pageStart}-${params.pageEnd}`
          : "the assigned pages";
      const topic = params.topic ?? "this topic";
      const firstMessage: ChatMessage = {
        role: "user",
        content: `Teach me ${topic} from ${params.moduleName}, ${range}, in teacher mode: explain simply first, then give the exact exam answer format.`,
      };
      const bannerDetail =
        params.topic ??
        (params.pageStart !== null && params.pageEnd !== null
          ? params.pageStart === params.pageEnd
            ? `page ${params.pageStart}`
            : `pages ${params.pageStart}-${params.pageEnd}`
          : "assigned pages");

      setLearnBanner(`Studying: ${params.moduleName} - ${bannerDetail}`);
      setActiveHistoryId(params.chatId);
      currentChatIdRef.current = params.chatId;
      setCurrentChatId(params.chatId);
      setRestoreSession((current) => ({
        key: current.key + 1,
        messages: [firstMessage],
      }));
      chatMessagesRef.current = [firstMessage];
      window.history.replaceState({}, "", window.location.pathname);

      try {
        const chatResponse = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceIds: [matchingSource.id],
            messages: [firstMessage],
          }),
        });
        let chatPayload: unknown = null;
        try {
          chatPayload = await chatResponse.json();
        } catch {
          chatPayload = null;
        }
        if (!chatResponse.ok) {
          const message =
            isRecord(chatPayload) && typeof chatPayload.error === "string"
              ? chatPayload.error
              : "The teacher could not answer. Try again.";
          setLearnError(message);
          return;
        }
        if (!isRecord(chatPayload) || typeof chatPayload.reply !== "string") {
          setLearnError("The teacher could not answer. Try again.");
          return;
        }

        const completedMessages: ChatMessage[] = [
          firstMessage,
          { role: "assistant", content: chatPayload.reply },
        ];
        chatMessagesRef.current = completedMessages;
        setRestoreSession((current) => ({
          key: current.key + 1,
          messages: completedMessages,
        }));
        handleAssistantReply(completedMessages);
      } catch {
        setLearnError("The teacher could not answer. Try again.");
      }
    })();
  }, [handleAssistantReply]);

  async function handleMarkTask(done: boolean) {
    if (!learnParams?.taskId || taskDoneSaving) return;
    setTaskDoneSaving(true);
    setTaskDoneError("");
    const result = await markTaskDone(learnParams.taskId, done);
    if (!result.ok) {
      setTaskDoneError(result.error ?? "Could not update this task.");
      setTaskDoneSaving(false);
      return;
    }

    setTaskDone(done);
    setTaskDoneSaving(false);
    if (done) {
      const next = await findNextTopicUrl(learnParams);
      setNextTopicUrl(next.url);
      setNextTopicStatus(next.status);
      if (next.error) setTaskDoneError(next.error);
    } else {
      setNextTopicUrl(null);
      setNextTopicStatus("");
    }
  }

  async function handleTestMe() {
    if (
      testMeStartedRef.current ||
      testMeSaving ||
      !learnParams
    ) {
      return;
    }
    testMeStartedRef.current = true;
    setTestMeSaving(true);
    setLearnError("");

    const range =
      learnParams.pageStart !== null && learnParams.pageEnd !== null
        ? learnParams.pageStart === learnParams.pageEnd
          ? `page ${learnParams.pageStart}`
          : `pages ${learnParams.pageStart}-${learnParams.pageEnd}`
        : "the assigned pages";
    const topic = learnParams.topic ?? "this topic";
    const quizMessage: ChatMessage = {
      role: "user",
      content: `Ask me 3 short exam-style questions on ${topic} (${range}), one at a time. After my third answer, tell me my score out of 3 and which part to revise.`,
    };
    const updatedMessages = [...chatMessagesRef.current, quizMessage];
    chatMessagesRef.current = updatedMessages;
    setRestoreSession((current) => ({
      key: current.key + 1,
      messages: updatedMessages,
    }));

    try {
      const matchingSource = sourcesRef.current.find(
        (source) =>
          source.enabled &&
          source.type === "pdf" &&
          !source.status &&
          !source.error
      );
      if (!matchingSource) {
        setLearnError("No PDF source is available to test this topic.");
        testMeStartedRef.current = false;
        return;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceIds: [matchingSource.id],
          messages: updatedMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        setLearnError(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "The teacher could not start the quiz. Try again."
        );
        return;
      }
      if (!isRecord(payload) || typeof payload.reply !== "string") {
        setLearnError("The teacher could not start the quiz. Try again.");
        return;
      }
      const completedMessages: ChatMessage[] = [
        ...updatedMessages,
        { role: "assistant", content: payload.reply },
      ];
      chatMessagesRef.current = completedMessages;
      setRestoreSession((current) => ({
        key: current.key + 1,
        messages: completedMessages,
      }));
      handleAssistantReply(completedMessages);
    } catch {
      setLearnError("The teacher could not start the quiz. Try again.");
    } finally {
      setTestMeSaving(false);
    }
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
    const source = sourcesRef.current.find((item) => item.id === id);
    if (!source) return;

    sourceControllersRef.current.get(id)?.abort();
    sourceIndexWorkRef.current.delete(id);
    replaceSources(sourcesRef.current.filter((source) => source.id !== id));

    const task = sourceTasksRef.current.get(id);
    void (async () => {
      if (task) {
        try {
          await task;
        } catch {
          console.error("Could not stop source processing before cleanup.");
        }
      }

      const filePath =
        sourceFilePathsRef.current.get(id) ?? source.filePath;
      const supabase = createBrowserClient();
      const cleanupTasks: {
        label: string;
        run: () => Promise<void>;
      }[] = [
        {
          label: "source index rows",
          run: async () => {
            const { error } = await supabase
              .from("source_chunks")
              .delete()
              .eq("source_id", id);
            if (error) throw error;
          },
        },
      ];
      if (filePath) {
        cleanupTasks.push({
          label: "source PDF",
          run: async () => {
            const { error } = await supabase
              .storage.from("pdfs")
              .remove([filePath]);
            if (error) throw error;
          },
        });
      }

      const results = await Promise.allSettled(
        cleanupTasks.map((taskToRun) => taskToRun.run())
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(`Could not remove ${cleanupTasks[index].label}.`);
        }
      });
      sourceFilePathsRef.current.delete(id);
    })();
  }

  async function handleViewSource(id: string) {
    const source = sourcesRef.current.find((item) => item.id === id);
    if (!source?.filePath) return;

    updateSource(id, { viewError: undefined });
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      updateSource(id, { viewError: "Could not open this PDF." });
      return;
    }
    tab.opener = null;

    try {
      const supabase = createBrowserClient();
      const { data, error } = await supabase.storage
        .from("pdfs")
        .createSignedUrl(source.filePath, 3600);
      if (error || !data?.signedUrl) {
        throw new Error("Could not create a signed PDF URL.");
      }
      tab.location.href = data.signedUrl;
    } catch {
      tab.close();
      updateSource(id, { viewError: "Could not open this PDF." });
    }
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

          if (
            isRecord(data) &&
            (data.code === "DAILY_QUOTA" || data.code === "RATE_LIMIT")
          ) {
            const message =
              typeof data.error === "string"
                ? data.error
                : data.code === "DAILY_QUOTA"
                  ? DAILY_QUOTA_MESSAGE
                  : "Daily PDF upload limit reached. Try again later.";
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
    const task = indexSourceBatches(id, name, work, controller).finally(() => {
      if (sourceControllersRef.current.get(id) === controller) {
        sourceControllersRef.current.delete(id);
      }
    });
    sourceTasksRef.current.set(id, task);
    void task.then(
      () => {
        if (sourceTasksRef.current.get(id) === task) {
          sourceTasksRef.current.delete(id);
        }
      },
      () => {
        if (sourceTasksRef.current.get(id) === task) {
          sourceTasksRef.current.delete(id);
        }
        console.error("Could not finish source indexing.");
      }
    );
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
      filePath: null,
      fileSize: 0,
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
    if (file.size > MAX_PDF_BYTES) {
      setSourceMessage(MAX_FILE_ERROR);
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
      filePath: null,
      fileSize: file.size,
      status: "reading",
      progress: { start: 0, end: 0, total: 0 },
      savingOriginal: true,
    };
    replaceSources([...sourcesRef.current, source]);

    const controller = new AbortController();
    sourceControllersRef.current.set(id, controller);
    const uploadPromise = (async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) throw new Error(error.message);
      const userId = data.user?.id;
      if (!userId) throw new Error("Please sign in to save the original.");

      const filePath = `${userId}/${id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("pdfs")
        .upload(filePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);

      sourceFilePathsRef.current.set(id, filePath);
      return filePath;
    })();
    const uploadStatusPromise = uploadPromise.then(
      (filePath) => {
        updateSource(id, {
          filePath,
          savingOriginal: false,
          originalNotSaved: false,
          originalSaveError: undefined,
        });
        return filePath;
      },
      (error: unknown) => {
        updateSource(id, {
          filePath: null,
          savingOriginal: false,
          originalNotSaved: true,
          originalSaveError:
            process.env.NODE_ENV !== "production"
              ? error instanceof Error
                ? error.message
                : String(error)
              : undefined,
        });
        throw error;
      }
    );
    const readPromise = readPdfPages(
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

    const task = (async () => {
      try {
        const [pagesResult] = await Promise.allSettled([
          readPromise,
          uploadStatusPromise,
        ]);

        if (controller.signal.aborted) return;
        if (pagesResult.status === "rejected") {
          updateSource(id, {
            status: undefined,
            progress: undefined,
            error:
              pagesResult.reason instanceof Error
                ? pagesResult.reason.message
                : "This is not a readable PDF",
            errorDetail: undefined,
            retryable: false,
          });
          return;
        }
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

        const pages = pagesResult.value;
        if (pages.length > MAX_PDF_PAGES) return;
        if (!sourcesRef.current.some((current) => current.id === id)) return;

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
      } catch {
        if (!controller.signal.aborted) {
          updateSource(id, {
            status: undefined,
            progress: undefined,
            error: "Could not process this PDF.",
            retryable: false,
          });
        }
      } finally {
        if (sourceControllersRef.current.get(id) === controller) {
          sourceControllersRef.current.delete(id);
        }
      }
    })();
    sourceTasksRef.current.set(id, task);
    try {
      await task;
    } finally {
      if (sourceTasksRef.current.get(id) === task) {
        sourceTasksRef.current.delete(id);
      }
    }
  }

  function addPdfFiles(files: File[]) {
    const oversized = files.some((file) => file.size > MAX_PDF_BYTES);
    const queuedFiles = files.filter((file) => file.size <= MAX_PDF_BYTES);
    setSourceMessage(oversized ? MAX_FILE_ERROR : "");
    if (queuedFiles.length === 0) return;

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
      <AppNav />
      {(learnBanner || learnError) && (
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              {learnBanner && (
                <p className="truncate text-sm font-medium">
                  {learnBanner}
                </p>
              )}
              {learnError && (
                <p role="alert" className="mt-1 text-sm text-[var(--bad)]">
                  {learnError}
                </p>
              )}
              {taskDoneError && (
                <p role="alert" className="mt-1 text-sm text-[var(--bad)]">
                  {taskDoneError}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {learnParams?.taskId && (
                <>
                  {taskDone ? (
                    <>
                      <span className="text-xs font-medium text-[var(--accent)]">
                        Done
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleMarkTask(false)}
                        disabled={taskDoneSaving}
                        className={SECONDARY_ACTION_CLASS}
                      >
                        {taskDoneSaving ? "Saving..." : "Undo"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleMarkTask(true)}
                        disabled={taskDoneSaving}
                        className={PRIMARY_ACTION_CLASS}
                      >
                        {taskDoneSaving ? "Saving..." : "Mark as done"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTestMe()}
                        disabled={testMeSaving}
                        className={SECONDARY_ACTION_CLASS}
                      >
                        {testMeSaving ? "Starting..." : "Test me"}
                      </button>
                    </>
                  )}
                  {taskDone && (
                    <>
                      <span className="text-xs font-medium">
                        Done. Nice work.
                      </span>
                      {nextTopicUrl ? (
                        <a
                          href={nextTopicUrl}
                          className={SECONDARY_ACTION_CLASS}
                        >
                          Next topic
                        </a>
                      ) : nextTopicStatus ? (
                        <span className="text-xs text-[var(--muted)]">
                          {nextTopicStatus}
                        </span>
                      ) : null}
                    </>
                  )}
                </>
              )}
              <a
                href="/planner"
                className={`shrink-0 ${SECONDARY_ACTION_CLASS}`}
              >
                Back to plan
              </a>
            </div>
          </div>
        </div>
      )}
      <MobileTabs activeTab={activeTab} onSelect={setActiveTab} />
      <main
        id="main-content"
        tabIndex={-1}
        className="grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]"
      >
        <aside
          className={`${activeTab === "Notes" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col border-r border-[var(--border)] bg-[var(--bg)] lg:flex`}
        >
          <div className="overflow-y-auto p-5">
            <button
              type="button"
              onClick={handleNewNotes}
              className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
          className={`${activeTab === "Workspace" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col overflow-y-auto lg:flex`}
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
            onViewSource={handleViewSource}
            onPdfDragStateChange={setIsDraggingPdf}
          />
        </section>
      </main>
    </div>
  );
}
