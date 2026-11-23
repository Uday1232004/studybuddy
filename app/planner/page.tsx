"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  buildPlan,
  type PlannerExam,
  type PlannerModule,
} from "@/lib/planner";
import type { AnalysisTopic } from "@/lib/analysis";
import { createClient } from "@/lib/supabase/client";
import {
  addPdfSource,
  type UploadedPdfSource,
} from "@/lib/source-upload";
import { buildLearnUrl } from "@/lib/learn-link";

type Exam = {
  id: string;
  subject: string;
  exam_date: string;
  credits: number;
  difficulty: number;
  chat_id: string | null;
};

type PlannerSettingsForm = {
  hoursPerDay: string;
  daysOff: number[];
};

type SavedChat = {
  id: string;
  title: string | null;
  sources: unknown;
};

type PlannerPdfSource = Omit<UploadedPdfSource, "enabled"> & {
  enabled: boolean;
};

type PdfUploadJob = {
  key: string;
  examId: string;
  file: File;
  status: "queued" | "running" | "linking" | "done" | "error" | "cancelled";
  statusText: string;
  error: string;
  uploadWarning: string;
  source: UploadedPdfSource | null;
  historyId: string | null;
};

type HistoryItemResponse = {
  id: string;
  title: string | null;
  sources: unknown[];
  messages: unknown[];
  notes: string;
};

type PlanTask = {
  id: string | number;
  plan_id: string | null;
  exam_id: string;
  module: string | null;
  title: string;
  kind: "learn" | "practice" | "revise";
  pages: string | null;
  task_date: string;
  minutes: number;
  done: boolean;
  done_at: string | null;
  position: number;
};

type SavedPlan = {
  id: string;
  title: string;
  status: "active" | "archived";
  start_date: string;
  created_at: string;
};

type PlanTaskProgress = {
  id: string | number;
  plan_id: string;
  done: boolean;
};

type NewPlanTask = {
  plan_id: string;
  exam_id: string;
  module: string | null;
  title: string;
  kind: "learn" | "practice" | "revise";
  pages: string | null;
  task_date: string;
  minutes: number;
  position: number;
};

type ModuleAnalysisRow = {
  id: string;
  exam_id: string;
  chat_id: string;
  module_name: string;
  pages: number;
  overall_difficulty: number;
  summary: string;
  topics: AnalysisTopic[];
  model: string | null;
};

type ManualModuleDraft = {
  name: string;
  pages: string;
};

type ExamForm = {
  subject: string;
  examDate: string;
  credits: string;
  difficulty: string;
  chatId: string;
};

type ModuleResolution = {
  modules: PlannerModule[];
  manual: boolean;
  reason: string;
  invalidDraft: boolean;
};

const TASK_COLUMNS =
  "id, plan_id, exam_id, module, title, kind, pages, task_date, minutes, done, done_at, position";
const PLAN_COLUMNS = "id, title, status, start_date, created_at";
const ANALYSIS_COLUMNS =
  "id, exam_id, chat_id, module_name, pages, overall_difficulty, summary, topics, model";
const SOURCE_UUID_PATTERN =
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const WEEKDAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}

function parseRows<T>(
  value: unknown,
  parse: (item: unknown) => T | null
): { rows: T[]; invalid: boolean } {
  if (!Array.isArray(value)) return { rows: [], invalid: true };
  const rows: T[] = [];
  let invalid = false;
  for (const item of value) {
    const row = parse(item);
    if (row) rows.push(row);
    else invalid = true;
  }
  return { rows, invalid };
}

function parseExam(value: unknown): Exam | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.subject !== "string" ||
    typeof value.exam_date !== "string" ||
    typeof value.credits !== "number" ||
    typeof value.difficulty !== "number" ||
    !(typeof value.chat_id === "string" || value.chat_id === null)
  ) {
    return null;
  }
  return {
    id: value.id,
    subject: value.subject,
    exam_date: value.exam_date.slice(0, 10),
    credits: value.credits,
    difficulty: value.difficulty,
    chat_id: value.chat_id,
  };
}

function parseChat(value: unknown): SavedChat | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !(typeof value.title === "string" || value.title === null)
  ) {
    return null;
  }
  return { id: value.id, title: value.title, sources: value.sources };
}

function parsePlannerPdfSource(value: unknown): PlannerPdfSource | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !SOURCE_UUID_PATTERN.test(value.id) ||
    typeof value.name !== "string" ||
    value.type !== "pdf" ||
    typeof value.enabled !== "boolean" ||
    typeof value.pages !== "number" ||
    !Number.isInteger(value.pages) ||
    value.pages < 1 ||
    !(typeof value.filePath === "string" || value.filePath === null) ||
    typeof value.fileSize !== "number" ||
    !Number.isFinite(value.fileSize) ||
    value.fileSize < 0
  ) {
    return null;
  }
  return {
    id: value.id,
    type: "pdf",
    name: value.name,
    enabled: value.enabled,
    pages: value.pages,
    filePath: value.filePath,
    fileSize: value.fileSize,
  };
}

function findPdfSourceByName(
  chat: SavedChat | undefined,
  name: string
): PlannerPdfSource | null {
  if (!chat || !Array.isArray(chat.sources)) return null;
  const source = chat.sources.find(
    (item) => isRecord(item) && item.type === "pdf" && item.name === name
  );
  return parsePlannerPdfSource(source);
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseError(payload: unknown, fallback: string): string {
  if (
    isRecord(payload) &&
    typeof payload.error === "string" &&
    payload.error.trim() !== ""
  ) {
    return payload.error;
  }
  return fallback;
}

function parseHistoryItem(value: unknown): HistoryItemResponse | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !(typeof value.title === "string" || value.title === null) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.messages) ||
    !(typeof value.notes === "string" || value.notes === undefined)
  ) {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    sources: value.sources,
    messages: value.messages,
    notes: typeof value.notes === "string" ? value.notes : "",
  };
}

function parseTask(value: unknown): PlanTask | null {
  if (
    !isRecord(value) ||
    !(typeof value.id === "string" || typeof value.id === "number") ||
    !(typeof value.plan_id === "string" || value.plan_id === null) ||
    typeof value.exam_id !== "string" ||
    !(typeof value.module === "string" || value.module === null) ||
    typeof value.title !== "string" ||
    (value.kind !== "learn" &&
      value.kind !== "practice" &&
      value.kind !== "revise") ||
    !(typeof value.pages === "string" || value.pages === null) ||
    typeof value.task_date !== "string" ||
    typeof value.minutes !== "number" ||
    typeof value.done !== "boolean" ||
    !(typeof value.done_at === "string" || value.done_at === null) ||
    typeof value.position !== "number"
  ) {
    return null;
  }
  return {
    id: value.id,
    plan_id: value.plan_id,
    exam_id: value.exam_id,
    module: value.module,
    title: value.title,
    kind: value.kind,
    pages: value.pages,
    task_date: value.task_date.slice(0, 10),
    minutes: value.minutes,
    done: value.done,
    done_at: value.done_at,
    position: value.position,
  };
}

function parsePlan(value: unknown): SavedPlan | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    (value.status !== "active" && value.status !== "archived") ||
    typeof value.start_date !== "string" ||
    typeof value.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    status: value.status,
    start_date: value.start_date.slice(0, 10),
    created_at: value.created_at,
  };
}

function parsePlanTaskProgress(value: unknown): PlanTaskProgress | null {
  if (
    !isRecord(value) ||
    !(typeof value.id === "string" || typeof value.id === "number") ||
    typeof value.plan_id !== "string" ||
    typeof value.done !== "boolean"
  ) {
    return null;
  }
  return { id: value.id, plan_id: value.plan_id, done: value.done };
}

function parseAnalysisTopic(value: unknown): AnalysisTopic | null {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    typeof value.startPage !== "number" ||
    typeof value.endPage !== "number" ||
    typeof value.difficulty !== "number" ||
    typeof value.priority !== "number" ||
    typeof value.reason !== "string"
  ) {
    return null;
  }
  return {
    title: value.title,
    startPage: value.startPage,
    endPage: value.endPage,
    difficulty: value.difficulty,
    priority: value.priority,
    reason: value.reason,
  };
}

function parseModuleAnalysis(value: unknown): ModuleAnalysisRow | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.exam_id !== "string" ||
    typeof value.chat_id !== "string" ||
    typeof value.module_name !== "string" ||
    typeof value.pages !== "number" ||
    typeof value.overall_difficulty !== "number" ||
    typeof value.summary !== "string" ||
    !(typeof value.model === "string" || value.model === null)
  ) {
    return null;
  }
  const parsedTopics = parseRows(value.topics, parseAnalysisTopic);
  if (parsedTopics.invalid || parsedTopics.rows.length === 0) return null;
  return {
    id: value.id,
    exam_id: value.exam_id,
    chat_id: value.chat_id,
    module_name: value.module_name,
    pages: value.pages,
    overall_difficulty: value.overall_difficulty,
    summary: value.summary,
    topics: parsedTopics.rows,
    model: value.model,
  };
}

function parseSettings(value: unknown): PlannerSettingsForm | null {
  if (!isRecord(value)) return null;
  const hours =
    typeof value.hours_per_day === "number"
      ? value.hours_per_day
      : Number(value.hours_per_day);
  if (
    !Number.isFinite(hours) ||
    !Array.isArray(value.days_off) ||
    !value.days_off.every(
      (day) => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6
    )
  ) {
    return null;
  }
  return {
    hoursPerDay: String(hours),
    daysOff: [...new Set(value.days_off as number[])].sort((a, b) => a - b),
  };
}

function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultPlanTitle(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `Plan from ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatCreatedDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getAnalysisKey(examId: string, moduleName: string): string {
  return `${examId}::${moduleName}`;
}

function subscribeToLocalDay(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  return () => window.clearInterval(timer);
}

function getLocalDaySnapshot() {
  return getLocalDateString(new Date());
}

function getServerDaySnapshot() {
  return "";
}

function formatTaskDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(year, month - 1, day));
}

function parseTaskPages(pages: string | null): {
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

function modulesFromChat(chat: SavedChat | undefined): PlannerModule[] | null {
  if (!chat || !Array.isArray(chat.sources)) return null;
  const pdfSources = chat.sources.filter(
    (source): source is Record<string, unknown> =>
      isRecord(source) && source.type === "pdf"
  );
  if (
    pdfSources.length === 0 ||
    pdfSources.some(
      (source) =>
        typeof source.name !== "string" ||
        source.name.trim() === "" ||
        typeof source.pages !== "number" ||
        !Number.isInteger(source.pages) ||
        source.pages < 1
    )
  ) {
    return null;
  }
  return pdfSources.map((source) => ({
    name: source.name as string,
    pages: source.pages as number,
  }));
}

function resolveModules(
  exam: Exam,
  chats: SavedChat[],
  drafts: ManualModuleDraft[]
): ModuleResolution {
  if (exam.chat_id) {
    const linkedModules = modulesFromChat(
      chats.find((chat) => chat.id === exam.chat_id)
    );
    if (linkedModules) {
      return {
        modules: linkedModules,
        manual: false,
        reason: "",
        invalidDraft: false,
      };
    }
  }

  const modules: PlannerModule[] = [];
  let invalidDraft = false;
  for (const draft of drafts) {
    const name = draft.name.trim();
    const hasInput = name !== "" || draft.pages.trim() !== "";
    if (!hasInput) continue;
    const pages = Number(draft.pages);
    if (!name || !Number.isInteger(pages) || pages < 1) {
      invalidDraft = true;
      continue;
    }
    modules.push({ name, pages });
  }

  return {
    modules,
    manual: true,
    reason: exam.chat_id
      ? "This chat has no reliable PDF page counts, so enter modules and page counts manually."
      : "No chat is linked, so enter module names and page counts manually.",
    invalidDraft,
  };
}

export default function PlannerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState<PlannerSettingsForm>({
    hoursPerDay: "4",
    daysOff: [],
  });
  const [exams, setExams] = useState<Exam[]>([]);
  const [chats, setChats] = useState<SavedChat[]>([]);
  const [analyses, setAnalyses] = useState<ModuleAnalysisRow[]>([]);
  const [pdfUploadJobs, setPdfUploadJobs] = useState<PdfUploadJob[]>([]);
  const [removePdfConfirmation, setRemovePdfConfirmation] = useState<{
    examId: string;
    sourceId: string;
  } | null>(null);
  const [removingPdfId, setRemovingPdfId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [legacyTasks, setLegacyTasks] = useState<PlanTask[]>([]);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [activePlan, setActivePlan] = useState<SavedPlan | null>(null);
  const [planProgress, setPlanProgress] = useState<
    Record<string, { done: number; total: number }>
  >({});
  const [viewPlanId, setViewPlanId] = useState<string | null>(null);
  const [viewPlanTasks, setViewPlanTasks] = useState<PlanTask[]>([]);
  const [manualModules, setManualModules] = useState<
    Record<string, ManualModuleDraft[]>
  >({});
  const [examForm, setExamForm] = useState<ExamForm>({
    subject: "",
    examDate: "",
    credits: "3",
    difficulty: "3",
    chatId: "",
  });
  const [planName, setPlanName] = useState("");
  const today = useSyncExternalStore(
    subscribeToLocalDay,
    getLocalDaySnapshot,
    getServerDaySnapshot
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [addingExam, setAddingExam] = useState(false);
  const [buildingPlan, setBuildingPlan] = useState(false);
  const [planActionBusy, setPlanActionBusy] = useState<string | null>(null);
  const [deleteConfirmPlanId, setDeleteConfirmPlanId] = useState<string | null>(
    null
  );
  const [renamingPlanId, setRenamingPlanId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameCancelledRef = useRef(false);
  const [deletingExamIds, setDeletingExamIds] = useState<Set<string>>(
    new Set()
  );
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(
    new Set()
  );
  const [scanningModuleKeys, setScanningModuleKeys] = useState<Set<string>>(
    new Set()
  );
  const [savingAnalysisIds, setSavingAnalysisIds] = useState<Set<string>>(
    new Set()
  );
  const [dirtyAnalysisIds, setDirtyAnalysisIds] = useState<Set<string>>(
    new Set()
  );
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>(
    {}
  );
  const [analysisNotices, setAnalysisNotices] = useState<
    Record<string, string>
  >({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<
    { subject: string; plannedMinutes: number; unscheduledMinutes: number }[]
  >([]);
  const examsRef = useRef(exams);
  const chatsRef = useRef(chats);
  const pdfUploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pdfUploadControllersRef = useRef<Map<string, AbortController>>(
    new Map()
  );
  const dailyQuotaStoppedRef = useRef(false);
  examsRef.current = exams;
  chatsRef.current = chats;

  const isRequestRunning =
    savingSettings ||
    addingExam ||
    buildingPlan ||
    planActionBusy !== null ||
    deletingExamIds.size > 0 ||
    removingPdfId !== null ||
    pdfUploadJobs.some(
      (job) =>
        job.status === "queued" ||
        job.status === "running" ||
        job.status === "linking"
    ) ||
    updatingTaskIds.size > 0 ||
    scanningModuleKeys.size > 0 ||
    savingAnalysisIds.size > 0;

  const reloadPlansAndTasks = useCallback(async () => {
    const supabase = createClient();
    const errors: string[] = [];
    const { data: planData, error: planError } = await supabase
      .from("plans")
      .select(PLAN_COLUMNS)
      .order("created_at", { ascending: false });
    if (planError) {
      setPlansLoaded(false);
      setError(planError.message);
      return false;
    }

    const parsedPlans = parseRows(planData as unknown, parsePlan);
    if (parsedPlans.invalid) errors.push("Some saved plans could not be read.");
    const loadedPlans = parsedPlans.rows;
    const loadedActivePlan =
      loadedPlans.find((plan) => plan.status === "active") ?? null;
    setPlans(loadedPlans);
    setPlansLoaded(!parsedPlans.invalid);
    setActivePlan(loadedActivePlan);

    const { data: progressData, error: progressError } = await supabase
      .from("plan_tasks")
      .select("id, plan_id, done")
      .not("plan_id", "is", null);
    if (progressError) {
      errors.push(progressError.message);
    } else {
      const progressRows = parseRows(
        progressData as unknown,
        parsePlanTaskProgress
      );
      if (progressRows.invalid) {
        errors.push("Some plan progress could not be read.");
      }
      const nextProgress: Record<string, { done: number; total: number }> = {};
      for (const task of progressRows.rows) {
        const progress = nextProgress[task.plan_id] ?? { done: 0, total: 0 };
        progress.total++;
        if (task.done) progress.done++;
        nextProgress[task.plan_id] = progress;
      }
      setPlanProgress(nextProgress);
    }

    const taskQuery = loadedActivePlan
      ? supabase
          .from("plan_tasks")
          .select(TASK_COLUMNS)
          .eq("plan_id", loadedActivePlan.id)
          .order("task_date", { ascending: true })
          .order("position", { ascending: true })
      : supabase
          .from("plan_tasks")
          .select(TASK_COLUMNS)
          .is("plan_id", null)
          .order("task_date", { ascending: true })
          .order("position", { ascending: true });
    const { data: taskData, error: taskError } = await taskQuery;
    if (taskError) {
      errors.push(taskError.message);
    } else {
      const parsedTasks = parseRows(taskData as unknown, parseTask);
      if (parsedTasks.invalid) errors.push("Some plan tasks could not be read.");
      if (loadedActivePlan) {
        setTasks(parsedTasks.rows);
        setLegacyTasks([]);
      } else {
        setTasks([]);
        setLegacyTasks(parsedTasks.rows);
      }
    }

    if (errors.length > 0) setError(errors.join(" "));
    return errors.length === 0;
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPageData() {
      setLoading(true);
      setError("");
      const supabase = createClient();
      try {
        const [settingsResult, examsResult, chatsResult, analysesResult] =
          await Promise.all([
            supabase
              .from("planner_settings")
              .select("hours_per_day, days_off")
              .maybeSingle(),
            supabase
              .from("exams")
              .select("id, subject, exam_date, credits, difficulty, chat_id")
              .order("exam_date", { ascending: true }),
            supabase
              .from("study_kits")
              .select("id, title, sources")
              .order("title", { ascending: true }),
            supabase
              .from("module_analyses")
              .select(ANALYSIS_COLUMNS),
          ]);

        if (!active) return;

        const callErrors = [
          settingsResult.error?.message,
          examsResult.error?.message,
          chatsResult.error?.message,
          analysesResult.error?.message,
        ].filter((message): message is string => Boolean(message));

        const rawExams: unknown = examsResult.data;
        const parsedExams = parseRows(rawExams, parseExam);
        const rawChats: unknown = chatsResult.data;
        const parsedChats = parseRows(rawChats, parseChat);
        const rawAnalyses: unknown = analysesResult.data;
        const parsedAnalyses = parseRows(rawAnalyses, parseModuleAnalysis);

        if (!examsResult.error) {
          const loadedExams = parsedExams.rows.sort((a, b) =>
            a.exam_date.localeCompare(b.exam_date)
          );
          examsRef.current = loadedExams;
          setExams(loadedExams);
          if (parsedExams.invalid) {
            callErrors.push("Some saved subjects could not be read.");
          }
        }
        if (!chatsResult.error) {
          chatsRef.current = parsedChats.rows;
          setChats(parsedChats.rows);
          if (parsedChats.invalid) {
            callErrors.push("Some saved chats could not be read.");
          }
        }
        if (!analysesResult.error) {
          setAnalyses(parsedAnalyses.rows);
          if (parsedAnalyses.invalid) {
            callErrors.push("Some saved module analyses could not be read.");
          }
        }
        if (!settingsResult.error && settingsResult.data !== null) {
          const parsedSettings: unknown = settingsResult.data;
          const savedSettings = parseSettings(parsedSettings);
          if (savedSettings) setSettings(savedSettings);
          else callErrors.push("Your saved planner settings could not be read.");
        }

        setManualModules((current) => {
          const next = { ...current };
          for (const exam of parsedExams.rows) {
            if (!next[exam.id]) next[exam.id] = [{ name: "", pages: "" }];
          }
          return next;
        });
        if (callErrors.length > 0) setError(callErrors.join(" "));
        if (active) await reloadPlansAndTasks();
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load planner data."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPageData();
    return () => {
      active = false;
    };
  }, [reloadPlansAndTasks]);

  async function reloadPlannerModuleData() {
    const supabase = createClient();
    const [examResult, chatResult, analysisResult] = await Promise.all([
      supabase
        .from("exams")
        .select("id, subject, exam_date, credits, difficulty, chat_id")
        .order("exam_date", { ascending: true }),
      supabase
        .from("study_kits")
        .select("id, title, sources")
        .order("title", { ascending: true }),
      supabase.from("module_analyses").select(ANALYSIS_COLUMNS),
    ]);
    const errors = [
      examResult.error?.message,
      chatResult.error?.message,
      analysisResult.error?.message,
    ].filter((message): message is string => Boolean(message));
    if (errors.length > 0) throw new Error(errors.join(" "));

    const parsedExams = parseRows(examResult.data as unknown, parseExam);
    const parsedChats = parseRows(chatResult.data as unknown, parseChat);
    const parsedAnalyses = parseRows(
      analysisResult.data as unknown,
      parseModuleAnalysis
    );
    const parseErrors = [
      parsedExams.invalid ? "Some updated subjects could not be read." : "",
      parsedChats.invalid ? "Some updated PDF sources could not be read." : "",
      parsedAnalyses.invalid ? "Some updated module analyses could not be read." : "",
    ].filter(Boolean);

    const loadedExams = parsedExams.rows.sort((a, b) =>
      a.exam_date.localeCompare(b.exam_date)
    );
    examsRef.current = loadedExams;
    chatsRef.current = parsedChats.rows;
    setExams(loadedExams);
    setChats(parsedChats.rows);
    setAnalyses(parsedAnalyses.rows);
    setManualModules((current) => {
      const next = { ...current };
      for (const exam of loadedExams) {
        if (!next[exam.id]) next[exam.id] = [{ name: "", pages: "" }];
      }
      return next;
    });
    if (parseErrors.length > 0) setError(parseErrors.join(" "));
  }

  function updatePdfUploadJob(key: string, changes: Partial<PdfUploadJob>) {
    setPdfUploadJobs((current) =>
      current.map((job) => (job.key === key ? { ...job, ...changes } : job))
    );
  }

  function getUniquePdfName(
    fileName: string,
    existingNames: Set<string>
  ): string {
    const baseName = fileName.trim().slice(0, 120) || "Uploaded PDF";
    if (!existingNames.has(baseName)) return baseName;
    let suffix = 2;
    while (true) {
      const suffixText = ` (${suffix})`;
      const candidate = `${baseName.slice(0, 120 - suffixText.length)}${suffixText}`;
      if (!existingNames.has(candidate)) return candidate;
      suffix++;
    }
  }

  function queuePdfUploads(exam: Exam, files: File[]) {
    if (isRequestRunning || removePdfConfirmation !== null) return;
    setError("");
    setNotice("");
    const chat = exam.chat_id
      ? chatsRef.current.find((item) => item.id === exam.chat_id)
      : undefined;
    if (exam.chat_id && !chat) {
      setError("Could not load this subject's linked chat. Reload the page and try again.");
      return;
    }

    const existingSources = Array.isArray(chat?.sources) ? chat.sources : [];
    const reservedJobs = pdfUploadJobs.filter(
      (job) =>
        job.examId === exam.id &&
        (job.status === "queued" ||
          job.status === "running" ||
          job.status === "linking" ||
          (job.status === "error" && job.source !== null))
    );
    const available = Math.max(
      0,
      20 - existingSources.length - reservedJobs.length
    );
    if (files.length > available) {
      setError("A subject can have at most 20 sources.");
    }
    if (available === 0) return;

    const existingNames = new Set<string>();
    for (const source of existingSources) {
      if (isRecord(source) && typeof source.name === "string") {
        existingNames.add(source.name);
      }
    }
    for (const job of pdfUploadJobs) {
      if (
        job.examId === exam.id &&
        job.status !== "cancelled" &&
        (job.status !== "error" || job.source !== null)
      ) {
        existingNames.add(job.file.name);
      }
    }

    const newJobs = files.slice(0, available).map((file) => {
      const uniqueName = getUniquePdfName(file.name, existingNames);
      existingNames.add(uniqueName);
      const namedFile = new File([file], uniqueName, {
        type: file.type || "application/pdf",
        lastModified: file.lastModified,
      });
      return {
        key: crypto.randomUUID(),
        examId: exam.id,
        file: namedFile,
        status: "queued" as const,
        statusText: "Waiting to start...",
        error: "",
        uploadWarning: "",
        source: null,
        historyId: null,
      };
    });

    setPdfUploadJobs((current) => [...current, ...newJobs]);
    for (const job of newJobs) {
      pdfUploadQueueRef.current = pdfUploadQueueRef.current.then(
        () => processPdfUploadJob(job),
        () => processPdfUploadJob(job)
      );
    }
  }

  async function savePdfSourceToSubject(
    job: PdfUploadJob,
    source: UploadedPdfSource
  ) {
    const exam = examsRef.current.find((item) => item.id === job.examId);
    if (!exam) throw new Error("This subject could not be found.");

    let chatId = exam.chat_id;
    if (!chatId) {
      chatId = job.historyId;
      if (!chatId) {
        const response = await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${exam.subject} (planner)`,
            sources: [source],
            messages: [],
          }),
        });
        const payload = await readResponseJson(response);
        if (!response.ok) {
          throw new Error(
            responseError(payload, "Could not create a chat for this subject.")
          );
        }
        if (!isRecord(payload) || typeof payload.id !== "string") {
          throw new Error("The new chat response did not include an ID.");
        }
        chatId = payload.id;
        updatePdfUploadJob(job.key, { historyId: chatId });
      }

      const { error: linkError } = await createClient()
        .from("exams")
        .update({ chat_id: chatId })
        .eq("id", exam.id);
      if (linkError) throw new Error(linkError.message);

      const nextExams = examsRef.current.map((item) =>
        item.id === exam.id ? { ...item, chat_id: chatId } : item
      );
      examsRef.current = nextExams;
      setExams(nextExams);
      return;
    }

    const response = await fetch(`/api/history/${encodeURIComponent(chatId)}`);
    const payload = await readResponseJson(response);
    if (!response.ok) {
      throw new Error(
        responseError(payload, "Could not load this subject's chat.")
      );
    }
    const history = parseHistoryItem(payload);
    if (!history) throw new Error("The linked chat data could not be read.");

    const alreadyAdded = history.sources.some(
      (item) => isRecord(item) && item.id === source.id
    );
    if (alreadyAdded) return;

    const updateResponse = await fetch(
      `/api/history/${encodeURIComponent(chatId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: history.title || `${exam.subject} (planner)`,
          sources: [...history.sources, source],
          messages: history.messages,
        }),
      }
    );
    const updatePayload = await readResponseJson(updateResponse);
    if (!updateResponse.ok) {
      throw new Error(
        responseError(updatePayload, "Could not add the PDF to this chat.")
      );
    }
    if (!isRecord(updatePayload) || typeof updatePayload.id !== "string") {
      throw new Error("The chat update response was not valid.");
    }
  }

  async function processPdfUploadJob(job: PdfUploadJob): Promise<void> {
    if (dailyQuotaStoppedRef.current) {
      updatePdfUploadJob(job.key, {
        status: "error",
        statusText: "Indexing stopped.",
        error:
          "The daily Gemini embedding limit is used up. Try again tomorrow, or enable billing for the Gemini key.",
      });
      return;
    }

    const controller = new AbortController();
    pdfUploadControllersRef.current.set(job.key, controller);
    updatePdfUploadJob(job.key, {
      status: "running",
      statusText: "Starting...",
      error: "",
    });

    try {
      let source = job.source;
      let uploadWarning = job.uploadWarning;
      if (!source) {
        source = await addPdfSource(job.file, {
          onStatus: (statusText) => {
            if (statusText.startsWith("Original could not be saved:")) {
              uploadWarning = statusText;
              updatePdfUploadJob(job.key, {
                statusText: "Continuing without a saved original...",
                uploadWarning,
              });
              return;
            }
            updatePdfUploadJob(job.key, { statusText });
          },
          signal: controller.signal,
        });
        updatePdfUploadJob(job.key, { source, uploadWarning });
      }

      if (controller.signal.aborted) {
        throw new DOMException("The PDF upload was cancelled.", "AbortError");
      }
      updatePdfUploadJob(job.key, {
        status: "linking",
        statusText: uploadWarning
          ? "Saving this PDF to the subject without its original file..."
          : "Saving this PDF to the subject...",
      });
      pdfUploadControllersRef.current.delete(job.key);

      await savePdfSourceToSubject(job, source);
      await reloadPlannerModuleData();
      updatePdfUploadJob(job.key, {
        status: "done",
        statusText: uploadWarning
          ? "PDF added, but its original file was not saved."
          : "PDF added to this subject.",
        uploadWarning,
        error: "",
      });
    } catch (uploadError) {
      const quotaReached =
        uploadError instanceof Error &&
        (uploadError.name === "DailyQuotaError" ||
          /daily.*(?:gemini|embedding).*limit|daily quota/i.test(
            uploadError.message
          ));
      if (quotaReached) dailyQuotaStoppedRef.current = true;
      const cancelled =
        controller.signal.aborted ||
        (uploadError instanceof Error && uploadError.name === "AbortError");
      updatePdfUploadJob(job.key, {
        status: cancelled ? "cancelled" : "error",
        statusText: cancelled ? "Upload cancelled." : "Upload failed.",
        error: cancelled
          ? ""
          : getErrorMessage(uploadError, "Could not upload this PDF."),
      });
    } finally {
      pdfUploadControllersRef.current.delete(job.key);
    }
  }

  function cancelPdfUpload(job: PdfUploadJob) {
    const controller = pdfUploadControllersRef.current.get(job.key);
    if (!controller) return;
    controller.abort();
    updatePdfUploadJob(job.key, { statusText: "Cancelling..." });
  }

  function retryPdfUpload(job: PdfUploadJob) {
    if (job.status !== "error") return;
    const retry = {
      ...job,
      status: "queued" as const,
      statusText: "Waiting to retry...",
      error: "",
      uploadWarning: job.source ? job.uploadWarning : "",
    };
    updatePdfUploadJob(job.key, retry);
    pdfUploadQueueRef.current = pdfUploadQueueRef.current.then(
      () => processPdfUploadJob(retry),
      () => processPdfUploadJob(retry)
    );
  }

  async function removePdfFromSubject(
    exam: Exam,
    source: PlannerPdfSource
  ) {
    if (isRequestRunning) return;
    if (!exam.chat_id) {
      setError("This subject no longer has a linked chat.");
      return;
    }

    setError("");
    setNotice("");
    setRemovingPdfId(source.id);
    const cleanupErrors: string[] = [];
    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);
      const userId = authData.user?.id;
      if (!userId) throw new Error("Please sign in before removing this PDF.");

      const expectedPath = `${userId}/${source.id}.pdf`;
      if (source.filePath !== null && source.filePath !== expectedPath) {
        throw new Error("The stored PDF path did not match this source.");
      }

      const response = await fetch(
        `/api/history/${encodeURIComponent(exam.chat_id)}`
      );
      const payload = await readResponseJson(response);
      if (!response.ok) {
        throw new Error(
          responseError(payload, "Could not load this subject's chat.")
        );
      }
      const history = parseHistoryItem(payload);
      if (!history) throw new Error("The linked chat data could not be read.");

      const remainingSources = history.sources.filter(
        (item) => !isRecord(item) || item.id !== source.id
      );
      if (remainingSources.length !== history.sources.length) {
        const updateResponse = await fetch(
          `/api/history/${encodeURIComponent(exam.chat_id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: history.title || `${exam.subject} (planner)`,
              sources: remainingSources,
              messages: history.messages,
            }),
          }
        );
        const updatePayload = await readResponseJson(updateResponse);
        if (!updateResponse.ok) {
          throw new Error(
            responseError(updatePayload, "Could not remove this PDF from the chat.")
          );
        }
        if (!isRecord(updatePayload) || typeof updatePayload.id !== "string") {
          throw new Error("The chat update response was not valid.");
        }
      }

      setRemovePdfConfirmation(null);
      if (source.filePath === expectedPath) {
        const { error: fileError } = await supabase.storage
          .from("pdfs")
          .remove([expectedPath]);
        if (fileError) cleanupErrors.push(fileError.message);
      }

      const { error: chunkError } = await supabase
        .from("source_chunks")
        .delete()
        .eq("source_id", source.id);
      if (chunkError) cleanupErrors.push(chunkError.message);

      const { data: analysisData, error: analysisLookupError } = await supabase
        .from("module_analyses")
        .select("id")
        .eq("exam_id", exam.id)
        .eq("module_name", source.name)
        .maybeSingle();
      if (analysisLookupError) {
        cleanupErrors.push(analysisLookupError.message);
      } else if (analysisData !== null) {
        const analysisId =
          isRecord(analysisData) && typeof analysisData.id === "string"
            ? analysisData.id
            : null;
        if (!analysisId) {
          cleanupErrors.push("The saved module analysis could not be read.");
        } else {
          const { error: analysisDeleteError } = await supabase
            .from("module_analyses")
            .delete()
            .eq("id", analysisId);
          if (analysisDeleteError) {
            cleanupErrors.push(analysisDeleteError.message);
          }
        }
      }

      try {
        await reloadPlannerModuleData();
      } catch (reloadError) {
        cleanupErrors.push(
          getErrorMessage(reloadError, "Could not refresh the module list.")
        );
      }
      setNotice("PDF removed. Rebuild your plan to apply this.");
      if (cleanupErrors.length > 0) setError(cleanupErrors.join(" "));
    } catch (removeError) {
      setError(getErrorMessage(removeError, "Could not remove this PDF."));
    } finally {
      setRemovingPdfId(null);
    }
  }

  function toggleDayOff(day: number) {
    setSettings((current) => ({
      ...current,
      daysOff: current.daysOff.includes(day)
        ? current.daysOff.filter((item) => item !== day)
        : [...current.daysOff, day].sort((a, b) => a - b),
    }));
  }

  async function saveSettings() {
    setError("");
    setNotice("");
    const hoursPerDay = Number(settings.hoursPerDay);
    if (!Number.isFinite(hoursPerDay) || hoursPerDay < 0.5 || hoursPerDay > 16) {
      setError("Study hours must be between 0.5 and 16.");
      return;
    }

    setSavingSettings(true);
    try {
      const { error: saveError } = await createClient()
        .from("planner_settings")
        .upsert(
          {
            hours_per_day: hoursPerDay,
            days_off: settings.daysOff,
          },
          { onConflict: "user_id" }
        );
      if (saveError) {
        setError(saveError.message);
        return;
      }
      setNotice("Your planner settings are saved.");
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Could not save your settings."));
    } finally {
      setSavingSettings(false);
    }
  }

  async function addExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const subject = examForm.subject.trim();
    const credits = Number(examForm.credits);
    const difficulty = Number(examForm.difficulty);
    const localToday = getLocalDateString(new Date());
    if (!subject) {
      setError("Enter a subject name.");
      return;
    }
    if (!examForm.examDate || examForm.examDate < localToday) {
      setError("Choose today or a later date for the exam.");
      return;
    }
    if (!Number.isInteger(credits) || credits < 1 || credits > 10) {
      setError("Credits must be a whole number from 1 to 10.");
      return;
    }
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
      setError("Difficulty must be a whole number from 1 to 5.");
      return;
    }

    setAddingExam(true);
    try {
      const { data, error: insertError } = await createClient()
        .from("exams")
        .insert({
          subject,
          exam_date: examForm.examDate,
          credits,
          difficulty,
          chat_id: examForm.chatId || null,
        })
        .select("id, subject, exam_date, credits, difficulty, chat_id")
        .single();
      if (insertError) {
        setError(insertError.message);
        return;
      }

      const savedExam = parseExam(data as unknown);
      if (!savedExam) {
        setError("The subject was saved, but its details could not be read.");
        return;
      }
      const nextExams = [...examsRef.current, savedExam].sort((a, b) =>
        a.exam_date.localeCompare(b.exam_date)
      );
      examsRef.current = nextExams;
      setExams(nextExams);
      setManualModules((current) => ({
        ...current,
        [savedExam.id]: [{ name: "", pages: "" }],
      }));
      setExamForm({
        subject: "",
        examDate: "",
        credits: "3",
        difficulty: "3",
        chatId: "",
      });
      setNotice("Subject added.");
    } catch (insertError) {
      setError(getErrorMessage(insertError, "Could not add this subject."));
    } finally {
      setAddingExam(false);
    }
  }

  async function deleteExam(exam: Exam) {
    if (isRequestRunning) return;
    if (!window.confirm(`Delete ${exam.subject}?`)) return;
    setError("");
    setNotice("");
    setDeletingExamIds((current) => new Set(current).add(exam.id));
    try {
      const { error: deleteError } = await createClient()
        .from("exams")
        .delete()
        .eq("id", exam.id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      const nextExams = examsRef.current.filter((item) => item.id !== exam.id);
      examsRef.current = nextExams;
      setExams(nextExams);
      setTasks((current) => current.filter((task) => task.exam_id !== exam.id));
      setManualModules((current) => {
        const next = { ...current };
        delete next[exam.id];
        return next;
      });
      setNotice("Subject deleted.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Could not delete this subject."));
    } finally {
      setDeletingExamIds((current) => {
        const next = new Set(current);
        next.delete(exam.id);
        return next;
      });
    }
  }

  function updateManualModule(
    examId: string,
    index: number,
    field: keyof ManualModuleDraft,
    value: string
  ) {
    setManualModules((current) => {
      const rows = current[examId] ?? [{ name: "", pages: "" }];
      return {
        ...current,
        [examId]: rows.map((row, rowIndex) =>
          rowIndex === index ? { ...row, [field]: value } : row
        ),
      };
    });
  }

  function addManualModule(examId: string) {
    setManualModules((current) => ({
      ...current,
      [examId]: [
        ...(current[examId] ?? []),
        { name: "", pages: "" },
      ],
    }));
  }

  function removeManualModule(examId: string, index: number) {
    setManualModules((current) => {
      const rows = current[examId] ?? [];
      return {
        ...current,
        [examId]: rows.filter((_, rowIndex) => rowIndex !== index),
      };
    });
  }

  function changeAnalysisDifficulty(
    analysisId: string,
    topicIndex: number,
    difficulty: number
  ) {
    setAnalyses((current) =>
      current.map((analysis) =>
        analysis.id === analysisId
          ? {
              ...analysis,
              topics: analysis.topics.map((topic, index) =>
                index === topicIndex ? { ...topic, difficulty } : topic
              ),
            }
          : analysis
      )
    );
    setDirtyAnalysisIds((current) => new Set(current).add(analysisId));
  }

  async function scanModule(examId: string, module: PlannerModule) {
    const key = getAnalysisKey(examId, module.name);
    setAnalysisErrors((current) => ({ ...current, [key]: "" }));
    setAnalysisNotices((current) => ({ ...current, [key]: "" }));
    setScanningModuleKeys((current) => new Set(current).add(key));
    try {
      const response = await fetch("/api/planner/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, sourceName: module.name }),
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        setAnalysisErrors((current) => ({
          ...current,
          [key]: "The scan returned an unreadable response. Try again.",
        }));
        return;
      }
      if (!response.ok) {
        const message =
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Could not scan this PDF. Try again.";
        setAnalysisErrors((current) => ({ ...current, [key]: message }));
        return;
      }
      if (!isRecord(payload) || !isRecord(payload.analysis)) {
        setAnalysisErrors((current) => ({
          ...current,
          [key]: "The scan returned an unexpected response. Try again.",
        }));
        return;
      }

      const { data, error: loadError } = await createClient()
        .from("module_analyses")
        .select(ANALYSIS_COLUMNS)
        .eq("exam_id", examId)
        .eq("module_name", module.name)
        .maybeSingle();
      if (loadError) {
        setAnalysisErrors((current) => ({
          ...current,
          [key]: loadError.message,
        }));
        return;
      }
      const savedAnalysis = parseModuleAnalysis(data as unknown);
      if (!savedAnalysis) {
        setAnalysisErrors((current) => ({
          ...current,
          [key]: "The analysis was saved, but could not be loaded.",
        }));
        return;
      }

      setAnalyses((current) => [
        ...current.filter(
          (analysis) =>
            analysis.id !== savedAnalysis.id &&
            !(
              analysis.exam_id === examId &&
              analysis.module_name === module.name
            )
        ),
        savedAnalysis,
      ]);
      setDirtyAnalysisIds((current) => {
        const next = new Set(current);
        next.delete(savedAnalysis.id);
        return next;
      });
      setAnalysisNotices((current) => ({
        ...current,
        [key]: "Analysis saved.",
      }));
    } catch (scanError) {
      setAnalysisErrors((current) => ({
        ...current,
        [key]:
          scanError instanceof Error
            ? scanError.message
            : "Could not scan this PDF. Try again.",
      }));
    } finally {
      setScanningModuleKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function saveAnalysisChanges(analysis: ModuleAnalysisRow) {
    const key = getAnalysisKey(analysis.exam_id, analysis.module_name);
    setAnalysisErrors((current) => ({ ...current, [key]: "" }));
    setAnalysisNotices((current) => ({ ...current, [key]: "" }));
    setSavingAnalysisIds((current) => new Set(current).add(analysis.id));
    try {
      const { error: saveError } = await createClient()
        .from("module_analyses")
        .update({ topics: analysis.topics })
        .eq("id", analysis.id);
      if (saveError) {
        setAnalysisErrors((current) => ({
          ...current,
          [key]: saveError.message,
        }));
        return;
      }
      setDirtyAnalysisIds((current) => {
        const next = new Set(current);
        next.delete(analysis.id);
        return next;
      });
      setAnalysisNotices((current) => ({
        ...current,
        [key]: "Your topic changes are saved.",
      }));
    } catch (saveError) {
      setAnalysisErrors((current) => ({
        ...current,
        [key]:
          saveError instanceof Error
            ? saveError.message
            : "Could not save your topic changes.",
      }));
    } finally {
      setSavingAnalysisIds((current) => {
        const next = new Set(current);
        next.delete(analysis.id);
        return next;
      });
    }
  }

  async function viewSavedPlan(plan: SavedPlan) {
    if (isRequestRunning) return;
    setError("");
    setPlanActionBusy(`view:${plan.id}`);
    try {
      const { data, error: taskError } = await createClient()
        .from("plan_tasks")
        .select(TASK_COLUMNS)
        .eq("plan_id", plan.id)
        .order("task_date", { ascending: true })
        .order("position", { ascending: true });
      if (taskError) {
        setError(taskError.message);
        return;
      }
      const parsed = parseRows(data as unknown, parseTask);
      if (parsed.invalid) {
        setError("Some tasks in this plan could not be read.");
        return;
      }
      setViewPlanTasks(parsed.rows);
      setViewPlanId(plan.id);
    } catch (viewError) {
      setError(getErrorMessage(viewError, "Could not open this plan."));
    } finally {
      setPlanActionBusy(null);
    }
  }

  async function makePlanActive(plan: SavedPlan) {
    if (isRequestRunning) return;
    setError("");
    setNotice("");
    setPlanActionBusy(`activate:${plan.id}`);
    try {
      const supabase = createClient();
      const { error: archiveError } = await supabase
        .from("plans")
        .update({ status: "archived" })
        .eq("status", "active")
        .neq("id", plan.id);
      if (archiveError) {
        await reloadPlansAndTasks();
        setError(archiveError.message);
        return;
      }

      const { error: activateError } = await supabase
        .from("plans")
        .update({ status: "active" })
        .eq("id", plan.id);
      if (activateError) {
        await reloadPlansAndTasks();
        setError(activateError.message);
        return;
      }

      setViewPlanId(null);
      setViewPlanTasks([]);
      await reloadPlansAndTasks();
      setNotice("This plan is now active.");
    } catch (activationError) {
      await reloadPlansAndTasks();
      setError(
        getErrorMessage(activationError, "Could not make this plan active.")
      );
    } finally {
      setPlanActionBusy(null);
    }
  }

  function startPlanRename(plan: SavedPlan) {
    renameCancelledRef.current = false;
    setError("");
    setRenamingPlanId(plan.id);
    setRenameDraft(plan.title);
  }

  function cancelPlanRename() {
    renameCancelledRef.current = true;
    setRenamingPlanId(null);
    setRenameDraft("");
  }

  async function savePlanRename(plan: SavedPlan, value: string) {
    const title = value.trim();
    if (title.length < 1 || title.length > 80) {
      setError("Plan names must be between 1 and 80 characters.");
      return;
    }
    if (planActionBusy !== null) return;
    if (title === plan.title) {
      setRenamingPlanId(null);
      setRenameDraft("");
      return;
    }

    setError("");
    setPlanActionBusy(`rename:${plan.id}`);
    try {
      const { error: renameError } = await createClient()
        .from("plans")
        .update({ title })
        .eq("id", plan.id);
      if (renameError) {
        setError(renameError.message);
        return;
      }
      setPlans((current) =>
        current.map((item) =>
          item.id === plan.id ? { ...item, title } : item
        )
      );
      setActivePlan((current) =>
        current?.id === plan.id ? { ...current, title } : current
      );
      setRenamingPlanId(null);
      setRenameDraft("");
      setNotice("Plan name saved.");
    } catch (renameError) {
      setError(getErrorMessage(renameError, "Could not rename this plan."));
    } finally {
      setPlanActionBusy(null);
    }
  }

  async function deletePlan(plan: SavedPlan) {
    if (isRequestRunning) return;
    setError("");
    setNotice("");
    setPlanActionBusy(`delete:${plan.id}`);
    try {
      const { error: deleteError } = await createClient()
        .from("plans")
        .delete()
        .eq("id", plan.id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      setDeleteConfirmPlanId(null);
      if (viewPlanId === plan.id) {
        setViewPlanId(null);
        setViewPlanTasks([]);
      }
      await reloadPlansAndTasks();
      setNotice("Plan deleted.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Could not delete this plan."));
    } finally {
      setPlanActionBusy(null);
    }
  }

  async function buildAndSavePlan() {
    if (isRequestRunning) return;
    setError("");
    setNotice("");
    setWarnings([]);
    setSummaries([]);
    if (exams.length === 0) {
      setError("Add a subject before building your plan.");
      return;
    }
    if (!plansLoaded) {
      setError("Could not check your saved plans. Reload the page before building a new plan.");
      return;
    }

    const planExams: PlannerExam[] = [];
    for (const exam of exams) {
      const resolution = resolveModules(
        exam,
        chats,
        manualModules[exam.id] ?? [{ name: "", pages: "" }]
      );
      if (resolution.invalidDraft) {
        setError(`Finish or remove the incomplete module entries for ${exam.subject}.`);
        return;
      }
      if (resolution.modules.length === 0) {
        setError(`Add at least one module with a page count for ${exam.subject}.`);
        return;
      }
      planExams.push({
        id: exam.id,
        subject: exam.subject,
        examDate: exam.exam_date,
        credits: exam.credits,
        difficulty: exam.difficulty,
        modules: resolution.modules.map((module) => {
          if (resolution.manual) return module;
          const analysis = analyses.find(
            (item) =>
              item.exam_id === exam.id &&
              item.chat_id === exam.chat_id &&
              item.module_name === module.name
          );
          if (!analysis || analysis.pages !== module.pages) return module;
          return {
            ...module,
            topics: analysis.topics.map((topic) => ({
              title: topic.title,
              startPage: topic.startPage,
              endPage: topic.endPage,
              difficulty: topic.difficulty,
              priority: topic.priority,
            })),
          };
        }),
      });
    }

    const hoursPerDay = Number(settings.hoursPerDay);
    if (!Number.isFinite(hoursPerDay) || hoursPerDay < 0.5 || hoursPerDay > 16) {
      setError("Study hours must be between 0.5 and 16.");
      return;
    }

    setBuildingPlan(true);
    try {
      const now = new Date();
      const startDate = getLocalDateString(now);
      const plan = buildPlan(planExams, {
        hoursPerDay,
        daysOff: settings.daysOff,
        startDate,
      });
      setWarnings(plan.warnings);
      setSummaries(
        plan.summaries.map((summary) => ({
          subject: summary.subject,
          plannedMinutes: summary.plannedMinutes,
          unscheduledMinutes: summary.unscheduledMinutes,
        }))
      );

      if (plan.tasks.length === 0) {
        setNotice("No tasks were created. Check the warnings above and try again.");
        return;
      }

      if (
        activePlan &&
        !window.confirm(
          "Your current plan will be saved in History and a new plan will become active. Continue?"
        )
      ) {
        return;
      }

      const title =
        planName.trim().slice(0, 80) || getDefaultPlanTitle(now);
      const supabase = createClient();
      const { data: newPlanData, error: createPlanError } = await supabase
        .from("plans")
        .insert({
          title,
          status: "archived",
          start_date: startDate,
          settings: {
            hoursPerDay,
            daysOff: settings.daysOff,
            startDate,
          },
          warnings: plan.warnings,
          summary: plan.summaries,
        })
        .select("id")
        .single();
      if (createPlanError) {
        setError(createPlanError.message);
        return;
      }

      const newPlanId =
        isRecord(newPlanData) && typeof newPlanData.id === "string"
          ? newPlanData.id
          : null;
      if (!newPlanId) {
        setError("The plan was created, but its ID could not be read.");
        return;
      }

      const newRows: NewPlanTask[] = plan.tasks.map((task) => ({
        plan_id: newPlanId,
        exam_id: task.examId,
        module: task.module,
        title: task.title,
        kind: task.kind,
        pages: task.pages,
        task_date: task.taskDate,
        minutes: Math.max(5, Math.round(task.minutes)),
        position: task.position,
      }));

      let taskInsertError = "";
      try {
        const { error: insertError } = await supabase
          .from("plan_tasks")
          .insert(newRows);
        if (insertError) taskInsertError = insertError.message;
      } catch (insertError) {
        taskInsertError = getErrorMessage(
          insertError,
          "Could not save the plan tasks."
        );
      }

      if (taskInsertError) {
        let cleanupErrorMessage = "";
        try {
          const { error: cleanupError } = await supabase
            .from("plans")
            .delete()
            .eq("id", newPlanId);
          if (cleanupError) cleanupErrorMessage = cleanupError.message;
        } catch (cleanupError) {
          cleanupErrorMessage = getErrorMessage(
            cleanupError,
            "The temporary plan could not be removed."
          );
        }
        await reloadPlansAndTasks();
        setError(
          cleanupErrorMessage
            ? `${taskInsertError} The new plan could not be removed: ${cleanupErrorMessage}`
            : taskInsertError
        );
        return;
      }

      const { error: archiveError } = await supabase
        .from("plans")
        .update({ status: "archived" })
        .eq("status", "active")
        .neq("id", newPlanId);
      if (archiveError) {
        await reloadPlansAndTasks();
        setError(archiveError.message);
        return;
      }

      const { error: activateError } = await supabase
        .from("plans")
        .update({ status: "active" })
        .eq("id", newPlanId);
      if (activateError) {
        await reloadPlansAndTasks();
        setError(activateError.message);
        return;
      }

      setViewPlanId(null);
      setViewPlanTasks([]);
      setPlanName("");
      await reloadPlansAndTasks();
      setNotice("Your study plan is ready.");
    } catch (planError) {
      setError(getErrorMessage(planError, "Could not build your plan."));
    } finally {
      setBuildingPlan(false);
    }
  }

  async function toggleTask(task: PlanTask, done: boolean) {
    const taskPlanId = task.plan_id;
    if (
      viewPlanId !== null ||
      activePlan === null ||
      taskPlanId === null ||
      taskPlanId !== activePlan.id ||
      task.done === done
    ) {
      return;
    }
    setError("");
    const key = String(task.id);
    const doneAt = done ? new Date().toISOString() : null;
    const progressDelta = done ? 1 : -1;
    setUpdatingTaskIds((current) => new Set(current).add(key));
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, done, done_at: doneAt }
          : item
      )
    );
    setPlanProgress((current) => {
      const progress = current[taskPlanId] ?? { done: 0, total: 0 };
      return {
          ...current,
          [taskPlanId]: {
            ...progress,
            done: Math.max(0, Math.min(progress.total, progress.done + progressDelta)),
          },
      };
    });
    try {
      const { error: updateError } = await createClient()
        .from("plan_tasks")
        .update({ done, done_at: doneAt })
        .eq("id", task.id);
      if (updateError) {
        setPlanProgress((current) => {
          const progress = current[taskPlanId] ?? { done: 0, total: 0 };
          return {
            ...current,
            [taskPlanId]: {
              ...progress,
              done: Math.max(0, Math.min(progress.total, progress.done - progressDelta)),
            },
          };
        });
        setTasks((current) =>
          current.map((item) =>
            item.id === task.id
              ? { ...item, done: task.done, done_at: task.done_at }
              : item
          )
        );
        setError(updateError.message);
      }
    } catch (updateError) {
      setPlanProgress((current) => {
        const progress = current[taskPlanId] ?? { done: 0, total: 0 };
        return {
          ...current,
          [taskPlanId]: {
            ...progress,
            done: Math.max(0, Math.min(progress.total, progress.done - progressDelta)),
          },
        };
      });
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? { ...item, done: task.done, done_at: task.done_at }
            : item
        )
      );
      setError(getErrorMessage(updateError, "Could not update this task."));
    } finally {
      setUpdatingTaskIds((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  const modulesByExam = exams.map((exam) => ({
    exam,
    resolution: resolveModules(
      exam,
      chats,
      manualModules[exam.id] ?? [{ name: "", pages: "" }]
    ),
  }));
  const allModulesMissing =
    exams.length > 0 &&
    modulesByExam.every(({ resolution }) => resolution.modules.length === 0);
  const viewedPlan =
    viewPlanId === null
      ? null
      : plans.find((plan) => plan.id === viewPlanId) ?? null;
  const checklistTasks =
    viewPlanId !== null
      ? viewPlanTasks
      : activePlan
        ? tasks
        : legacyTasks;
  const checklistReadOnly = viewPlanId !== null || activePlan === null;
  const completedTasks = checklistTasks.filter((task) => task.done).length;
  const progress = checklistTasks.length
    ? Math.round((completedTasks / checklistTasks.length) * 100)
    : 0;
  const tasksByDate = new Map<string, PlanTask[]>();
  for (const task of checklistTasks) {
    const group = tasksByDate.get(task.task_date) ?? [];
    group.push(task);
    tasksByDate.set(task.task_date, group);
  }
  const groupedTaskDates = [...tasksByDate.keys()].sort((a, b) =>
    a.localeCompare(b)
  );

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--bg)] text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-5">
        <Link
          href="/"
          className="text-sm font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          StudyBuddy
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Back to workspace
        </Link>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
            PLAN YOUR STUDY
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            Study planner
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Add your exams, check the modules, and build a day-by-day plan.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[var(--bad)] bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad)]"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            {notice}
          </p>
        )}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-bold">Settings</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-[220px_1fr]">
            <label className="block text-sm font-medium">
              Study hours per day
              <input
                type="number"
                min="0.5"
                max="16"
                step="0.5"
                value={settings.hoursPerDay}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    hoursPerDay: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
            <fieldset>
              <legend className="text-sm font-medium">Days off</legend>
              <div className="mt-3 flex flex-wrap gap-3">
                {WEEKDAYS.map((day) => (
                  <label
                    key={day.value}
                    className="flex items-center gap-2 text-sm text-[var(--muted)]"
                  >
                    <input
                      type="checkbox"
                      checked={settings.daysOff.includes(day.value)}
                      onChange={() => toggleDayOff(day.value)}
                      className="accent-[var(--accent)]"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <button
            type="button"
            onClick={saveSettings}
            disabled={savingSettings}
            className="mt-5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {savingSettings ? "Saving..." : "Save settings"}
          </button>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-bold">Subjects</h2>
          <form onSubmit={addExam} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              Subject name
              <input
                type="text"
                value={examForm.subject}
                onChange={(event) =>
                  setExamForm((current) => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium">
              Exam date
              <input
                type="date"
                min={today || undefined}
                value={examForm.examDate}
                onChange={(event) =>
                  setExamForm((current) => ({
                    ...current,
                    examDate: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium">
              Credits (1-10)
              <input
                type="number"
                min="1"
                max="10"
                step="1"
                value={examForm.credits}
                onChange={(event) =>
                  setExamForm((current) => ({
                    ...current,
                    credits: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium">
              Difficulty (1-5)
              <input
                type="number"
                min="1"
                max="5"
                step="1"
                value={examForm.difficulty}
                onChange={(event) =>
                  setExamForm((current) => ({
                    ...current,
                    difficulty: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium">
              Saved chat (optional)
              <select
                value={examForm.chatId}
                onChange={(event) =>
                  setExamForm((current) => ({
                    ...current,
                    chatId: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              >
                <option value="">No chat linked</option>
                {chats.map((chat) => (
                  <option key={chat.id} value={chat.id}>
                    {chat.title?.trim() || "Saved chat"}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={addingExam}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {addingExam ? "Adding..." : "Add subject"}
              </button>
            </div>
          </form>

          <div className="mt-5 divide-y divide-[var(--border)]">
            {exams.length === 0 ? (
              <p className="py-3 text-sm text-[var(--muted)]">
                No subjects yet. Add one above to get started.
              </p>
            ) : (
              exams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-semibold">{exam.subject}</p>
                    <p className="text-xs text-[var(--muted)]">
                      Exam: {exam.exam_date} · {exam.credits} credits ·
                      difficulty {exam.difficulty}
                    </p>
                    {exam.chat_id && (
                      <p className="text-xs text-[var(--muted)]">
                        Chat:{" "}
                        {chats.find((chat) => chat.id === exam.chat_id)?.title ??
                          "Saved chat"}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteExam(exam)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)]"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-bold">Modules for your plan</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Linked chats provide one module per PDF when each page count is saved. Otherwise, add the modules by hand.
          </p>
          {allModulesMissing && (
            <p className="mt-3 text-sm text-[var(--muted)]">
              No modules yet. Link a chat with PDFs or enter module names and page counts below.
            </p>
          )}
          <div className="mt-4 space-y-4">
            {modulesByExam.map(({ exam, resolution }) => {
              const linkedChat = chats.find(
                (chat) => chat.id === exam.chat_id
              );
              const linkedSources = Array.isArray(linkedChat?.sources)
                ? linkedChat.sources
                : [];
              const hasUploadedPdfs = linkedSources.some(
                (source) => isRecord(source) && source.type === "pdf"
              );
              const subjectJobs = pdfUploadJobs.filter(
                (job) => job.examId === exam.id
              );
              const reservedSources = subjectJobs.filter(
                (job) =>
                  job.status === "queued" ||
                  job.status === "running" ||
                  job.status === "linking" ||
                  (job.status === "error" && job.source !== null)
              ).length;
              const canUploadMore =
                linkedSources.length + reservedSources < 20;

              return (
                <div
                  key={exam.id}
                  className="rounded-xl border border-[var(--border)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold">{exam.subject}</h3>
                    <label
                      className={`cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-hover)] ${
                        !canUploadMore ||
                        isRequestRunning ||
                        removePdfConfirmation !== null
                          ? "pointer-events-none opacity-60"
                          : ""
                      }`}
                    >
                      Upload module PDFs
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        multiple
                        disabled={
                          !canUploadMore ||
                          isRequestRunning ||
                          removePdfConfirmation !== null
                        }
                        aria-label={`Upload module PDFs for ${exam.subject}`}
                        className="sr-only"
                        onChange={(event) => {
                          const files = Array.from(
                            event.currentTarget.files ?? []
                          );
                          event.currentTarget.value = "";
                          if (files.length > 0) queuePdfUploads(exam, files);
                        }}
                      />
                    </label>
                  </div>
                  {subjectJobs.map((job) => (
                    <div
                      key={job.key}
                      className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--bg)] p-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="break-all font-medium">{job.file.name}</p>
                        <p className="mt-1 text-[var(--muted)]">
                          {job.statusText}
                        </p>
                        {job.uploadWarning && (
                          <p className="mt-1 text-amber-700">
                            {job.uploadWarning}
                          </p>
                        )}
                        {job.error && (
                          <p role="alert" className="mt-1 text-[var(--bad)]">
                            {job.error}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {job.status === "running" && (
                          <button
                            type="button"
                            onClick={() => cancelPdfUpload(job)}
                            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 hover:bg-[var(--surface-hover)]"
                          >
                            Cancel
                          </button>
                        )}
                        {job.status === "error" && (
                          <button
                            type="button"
                            onClick={() => retryPdfUpload(job)}
                            disabled={isRequestRunning}
                            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 font-medium hover:bg-[var(--surface-hover)] disabled:opacity-60"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {resolution.manual && !hasUploadedPdfs ? (
                  <>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {resolution.reason}
                    </p>
                    <div className="mt-3 space-y-2">
                      {(manualModules[exam.id] ?? [{ name: "", pages: "" }]).map(
                        (module, index) => (
                          <div
                            key={`${exam.id}-module-${index}`}
                            className="grid gap-2 sm:grid-cols-[1fr_130px_auto]"
                          >
                            <input
                              aria-label={`${exam.subject} module name`}
                              placeholder="Module or PDF name"
                              value={module.name}
                              onChange={(event) =>
                                updateManualModule(
                                  exam.id,
                                  index,
                                  "name",
                                  event.target.value
                                )
                              }
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                            />
                            <input
                              aria-label={`${exam.subject} page count`}
                              type="number"
                              min="1"
                              step="1"
                              placeholder="Pages"
                              value={module.pages}
                              onChange={(event) =>
                                updateManualModule(
                                  exam.id,
                                  index,
                                  "pages",
                                  event.target.value
                                )
                              }
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                removeManualModule(exam.id, index)
                              }
                              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--surface-hover)]"
                            >
                              Remove
                            </button>
                          </div>
                        )
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => addManualModule(exam.id)}
                      className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)]"
                    >
                      Add module
                    </button>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Or upload the real PDF so the AI can read it and judge the difficulty.
                    </p>
                  </>
                  ) : resolution.manual ? (
                    <p className="mt-3 text-xs text-[var(--bad)]">
                      This PDF does not have a usable page count. Remove it and upload it again.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {resolution.modules.map((module, index) => {
                        const moduleSource = findPdfSourceByName(
                          linkedChat,
                          module.name
                        );
                        const confirmingRemoval =
                          moduleSource !== null &&
                          removePdfConfirmation?.examId === exam.id &&
                          removePdfConfirmation.sourceId === moduleSource.id;
                      const key = getAnalysisKey(exam.id, module.name);
                      const analysis = analyses.find(
                        (item) =>
                          item.exam_id === exam.id &&
                          item.module_name === module.name
                      );
                      const outOfDate =
                        analysis !== undefined &&
                        (analysis.pages !== module.pages ||
                          analysis.chat_id !== exam.chat_id);
                      const scanning = scanningModuleKeys.has(key);

                      return (
                        <div
                          key={`${module.name}-${index}`}
                          className="rounded-lg border border-[var(--border)] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm text-[var(--muted)]">
                              {module.name} — {module.pages} pages
                            </p>
                            <button
                              type="button"
                              onClick={() => void scanModule(exam.id, module)}
                              disabled={scanning}
                              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-hover)] disabled:opacity-60"
                            >
                              {scanning
                                ? `Reading ${module.pages} pages...`
                                : analysis
                                  ? "Scan again"
                                  : "Analyse with AI"}
                            </button>
                            {moduleSource && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRemovePdfConfirmation({
                                        examId: exam.id,
                                        sourceId: moduleSource.id,
                                      })
                                    }
                                    disabled={isRequestRunning}
                                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-60"
                                  >
                                    Remove PDF
                                  </button>
                            )}
                          </div>
                          {confirmingRemoval && moduleSource && (
                            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                                  <p className="text-xs">
                                    Remove this PDF from the plan? Its search data and AI scan are deleted.
                                  </p>
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setRemovePdfConfirmation(null)}
                                      disabled={removingPdfId !== null}
                                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-60"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void removePdfFromSubject(exam, moduleSource)
                                      }
                                      disabled={isRequestRunning}
                                      className="rounded-lg bg-[var(--bad)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                    >
                                      {removingPdfId === moduleSource.id
                                        ? "Removing..."
                                        : "Remove PDF"}
                                    </button>
                                  </div>
                            </div>
                          )}
                          {analysisErrors[key] && (
                            <p
                              role="alert"
                              className="mt-2 text-xs text-[var(--bad)]"
                            >
                              {analysisErrors[key]}
                            </p>
                          )}
                          {analysisNotices[key] && (
                            <p className="mt-2 text-xs text-[var(--muted)]">
                              {analysisNotices[key]}
                            </p>
                          )}
                          {analysis && (
                            <div className="mt-3 rounded-lg bg-[var(--bg)] p-3">
                              {outOfDate && (
                                <p className="mb-2 text-xs font-semibold text-amber-700">
                                  Out of date, scan again.
                                </p>
                              )}
                              <p className="text-sm">{analysis.summary}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                AI difficulty guess: {analysis.overall_difficulty}/5
                              </p>
                              <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[560px] text-left text-xs">
                                  <thead className="text-[var(--muted)]">
                                    <tr>
                                      <th className="py-2 pr-3">#</th>
                                      <th className="py-2 pr-3">Topic</th>
                                      <th className="py-2 pr-3">Pages</th>
                                      <th className="py-2 pr-3">Difficulty</th>
                                      <th className="py-2">Why</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {analysis.topics.map((topic, topicIndex) => (
                                      <tr
                                        key={`${topic.priority}-${topicIndex}`}
                                        className="border-t border-[var(--border)] align-top"
                                      >
                                        <td className="py-2 pr-3">
                                          {topic.priority}
                                        </td>
                                        <td className="py-2 pr-3">
                                          {topic.title}
                                        </td>
                                        <td className="py-2 pr-3">
                                          {topic.startPage === topic.endPage
                                            ? `p. ${topic.startPage}`
                                            : `pp. ${topic.startPage}-${topic.endPage}`}
                                        </td>
                                        <td className="py-2 pr-3">
                                          <select
                                            aria-label={`Difficulty for ${topic.title}`}
                                            value={topic.difficulty}
                                            onChange={(event) =>
                                              changeAnalysisDifficulty(
                                                analysis.id,
                                                topicIndex,
                                                Number(event.target.value)
                                              )
                                            }
                                            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                                          >
                                            {[1, 2, 3, 4, 5].map((level) => (
                                              <option key={level} value={level}>
                                                {level}
                                              </option>
                                            ))}
                                          </select>
                                        </td>
                                        <td className="py-2">{topic.reason}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <p className="mt-3 text-xs text-[var(--muted)]">
                                AI guesses can be wrong. Change any difficulty and the plan follows your number.
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  void saveAnalysisChanges(analysis)
                                }
                                disabled={
                                  !dirtyAnalysisIds.has(analysis.id) ||
                                  savingAnalysisIds.has(analysis.id)
                                }
                                className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-hover)] disabled:opacity-60"
                              >
                                {savingAnalysisIds.has(analysis.id)
                                  ? "Saving..."
                                  : "Save my changes"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">
                {viewPlanId ? "Plan checklist" : "Your study plan"}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {completedTasks} of {checklistTasks.length} tasks done ({progress}%)
              </p>
              {viewPlanId === null && activePlan && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Active plan: {activePlan.title} · Created{" "}
                  {formatCreatedDate(activePlan.created_at)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium">
                Plan name (optional)
                <input
                  type="text"
                  maxLength={80}
                  value={planName}
                  onChange={(event) => setPlanName(event.target.value)}
                  placeholder="Plan from today"
                  className="mt-1 block w-full min-w-48 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => void buildAndSavePlan()}
                disabled={
                  isRequestRunning || exams.length === 0 || !plansLoaded
                }
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {buildingPlan ? "Building..." : "Build my plan"}
              </button>
            </div>
          </div>

          {viewPlanId !== null && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--bg)] p-3">
              <p className="text-sm">
                {viewedPlan
                  ? `${viewedPlan.title} · Created ${formatCreatedDate(viewedPlan.created_at)}`
                  : "This saved plan is no longer available."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setViewPlanId(null);
                  setViewPlanTasks([]);
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-hover)]"
              >
                Back to my active plan
              </button>
            </div>
          )}
          {viewPlanId === null && !activePlan && legacyTasks.length > 0 && (
            <h3 className="mt-5 text-sm font-bold">
              Earlier plan (before history)
              <span className="ml-2 font-normal text-[var(--muted)]">
                Read-only
              </span>
            </h3>
          )}

          {warnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">Plan notes</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          {summaries.length > 0 && (
            <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
              {summaries.map((summary) => (
                <p key={summary.subject}>
                  {summary.subject}: {summary.plannedMinutes} minutes planned,{" "}
                  {summary.unscheduledMinutes} minutes left unscheduled.
                </p>
              ))}
            </div>
          )}

          {checklistTasks.length === 0 ? (
            <p className="mt-5 text-sm text-[var(--muted)]">
              {viewPlanId !== null
                ? "This plan has no tasks."
                : activePlan
                  ? "Your active plan has no tasks yet."
                  : legacyTasks.length > 0
                    ? "The earlier plan has no tasks."
                    : "No plan yet. Add subjects and modules, then build your plan."}
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {groupedTaskDates.map((date) => (
                <section key={date}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    {formatTaskDate(date)}
                    {date === today && (
                      <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                        Today
                      </span>
                    )}
                  </h3>
                  <div className="space-y-2">
                    {(tasksByDate.get(date) ?? []).map((task) => {
                      const taskKey = String(task.id);
                      const taskExam = exams.find(
                        (exam) => exam.id === task.exam_id
                      );
                      const taskChatId = taskExam?.chat_id ?? null;
                      const taskModule = task.module?.trim() ?? "";
                      const taskPages = parseTaskPages(task.pages);
                      const taskAnalysis = analyses.find(
                        (analysis) =>
                          analysis.exam_id === task.exam_id &&
                          analysis.chat_id === taskChatId &&
                          analysis.module_name === taskModule
                      );
                      const taskTopic =
                        taskAnalysis?.topics.find((topic) =>
                          taskPages.pageStart !== null &&
                          taskPages.pageEnd !== null
                            ? topic.startPage <= taskPages.pageEnd &&
                              topic.endPage >= taskPages.pageStart
                            : false
                        )?.title ?? null;
                      return (
                        <label
                          key={taskKey}
                          className={`flex items-start gap-3 rounded-xl border border-[var(--border)] p-3 ${
                            task.done ? "text-[var(--muted)]" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={task.done}
                            disabled={
                              checklistReadOnly ||
                              updatingTaskIds.has(taskKey) ||
                              isRequestRunning
                            }
                            onChange={(event) =>
                              void toggleTask(task, event.target.checked)
                            }
                            className="mt-1 accent-[var(--accent)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block text-sm ${
                                task.done ? "line-through" : ""
                              }`}
                            >
                              {task.title}
                            </span>
                            <span className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                              <span>{task.minutes} min</span>
                              <span className="rounded-full bg-[var(--bg)] px-2 py-0.5">
                                {task.kind}
                              </span>
                              {taskChatId && taskModule ? (
                                <Link
                                  href={buildLearnUrl({
                                    chatId: taskChatId,
                                    moduleName: taskModule,
                                    pageStart: taskPages.pageStart,
                                    pageEnd: taskPages.pageEnd,
                                    topic: taskTopic,
                                    taskId: taskKey,
                                  })}
                                  className="rounded-lg border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)]"
                                >
                                  {task.done ? "Review" : "Learn"}
                                </Link>
                              ) : (
                                <span className="text-xs text-[var(--muted)]">
                                  Upload the PDF to enable Learn
                                </span>
                              )}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-bold">Plan history</h2>
          {plans.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              No saved plans yet. Build your first plan above.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[var(--border)]">
              {plans.map((plan) => {
                const planTaskProgress = planProgress[plan.id] ?? {
                  done: 0,
                  total: 0,
                };
                const isRenaming = renamingPlanId === plan.id;
                const isConfirmingDelete = deleteConfirmPlanId === plan.id;
                return (
                  <div key={plan.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <input
                            type="text"
                            maxLength={80}
                            autoFocus
                            value={renameDraft}
                            onChange={(event) =>
                              setRenameDraft(event.target.value)
                            }
                            onBlur={(event) => {
                              if (renameCancelledRef.current) {
                                renameCancelledRef.current = false;
                                return;
                              }
                              void savePlanRename(plan, event.currentTarget.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                cancelPlanRename();
                                event.currentTarget.blur();
                              }
                            }}
                            aria-label="Plan name"
                            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                          />
                        ) : (
                          <p className="break-words font-semibold">
                            {plan.title}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                          <span>Created {formatCreatedDate(plan.created_at)}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ${
                              plan.status === "active"
                                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "bg-[var(--bg)]"
                            }`}
                          >
                            {plan.status === "active" ? "Active" : "Archived"}
                          </span>
                          <span>
                            {planTaskProgress.done} of {planTaskProgress.total}{" "}
                            tasks done
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void viewSavedPlan(plan)}
                          disabled={isRequestRunning}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-60"
                        >
                          View
                        </button>
                        {plan.status === "archived" && (
                          <button
                            type="button"
                            onClick={() => void makePlanActive(plan)}
                            disabled={isRequestRunning}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-60"
                          >
                            Make active
                          </button>
                        )}
                        {!isRenaming && (
                          <button
                            type="button"
                            onClick={() => startPlanRename(plan)}
                            disabled={isRequestRunning}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-60"
                          >
                            Rename
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmPlanId(plan.id)}
                          disabled={isRequestRunning}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {isConfirmingDelete && (
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                        <p className="text-sm">
                          Delete this plan and its checklist? This cannot be
                          undone.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmPlanId(null)}
                            disabled={isRequestRunning}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-60"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void deletePlan(plan)}
                            disabled={isRequestRunning}
                            className="rounded-lg bg-[var(--bad)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            Delete plan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
