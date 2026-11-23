"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  buildPlan,
  type PlannerExam,
  type PlannerModule,
} from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";

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

type PlanTask = {
  id: string | number;
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

type PlanTaskInput = Omit<PlanTask, "id">;

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
  "id, exam_id, module, title, kind, pages, task_date, minutes, done, done_at, position";
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

function parseTask(value: unknown): PlanTask | null {
  if (
    !isRecord(value) ||
    !(typeof value.id === "string" || typeof value.id === "number") ||
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

function toTaskInput(task: PlanTask): PlanTaskInput {
  return {
    exam_id: task.exam_id,
    module: task.module,
    title: task.title,
    kind: task.kind,
    pages: task.pages,
    task_date: task.task_date,
    minutes: task.minutes,
    done: task.done,
    done_at: task.done_at,
    position: task.position,
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
  const [tasks, setTasks] = useState<PlanTask[]>([]);
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
  const today = useSyncExternalStore(
    subscribeToLocalDay,
    getLocalDaySnapshot,
    getServerDaySnapshot
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [addingExam, setAddingExam] = useState(false);
  const [buildingPlan, setBuildingPlan] = useState(false);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(
    new Set()
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<
    { subject: string; plannedMinutes: number; unscheduledMinutes: number }[]
  >([]);

  useEffect(() => {
    let active = true;

    async function loadPageData() {
      setLoading(true);
      setError("");
      const supabase = createClient();
      try {
        const [settingsResult, examsResult, chatsResult, tasksResult] =
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
              .from("plan_tasks")
              .select(TASK_COLUMNS)
              .order("task_date", { ascending: true })
              .order("position", { ascending: true }),
          ]);

        if (!active) return;

        const callErrors = [
          settingsResult.error?.message,
          examsResult.error?.message,
          chatsResult.error?.message,
          tasksResult.error?.message,
        ].filter((message): message is string => Boolean(message));

        const rawExams: unknown = examsResult.data;
        const parsedExams = parseRows(rawExams, parseExam);
        const rawChats: unknown = chatsResult.data;
        const parsedChats = parseRows(rawChats, parseChat);
        const rawTasks: unknown = tasksResult.data;
        const parsedTasks = parseRows(rawTasks, parseTask);

        if (!examsResult.error) {
          setExams(
            parsedExams.rows.sort((a, b) =>
              a.exam_date.localeCompare(b.exam_date)
            )
          );
          if (parsedExams.invalid) {
            callErrors.push("Some saved subjects could not be read.");
          }
        }
        if (!chatsResult.error) {
          setChats(parsedChats.rows);
          if (parsedChats.invalid) {
            callErrors.push("Some saved chats could not be read.");
          }
        }
        if (!tasksResult.error) {
          setTasks(parsedTasks.rows);
          if (parsedTasks.invalid) {
            callErrors.push("Some saved plan tasks could not be read.");
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
  }, []);

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
      setExams((current) =>
        [...current, savedExam].sort((a, b) =>
          a.exam_date.localeCompare(b.exam_date)
        )
      );
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
    if (!window.confirm(`Delete ${exam.subject}?`)) return;
    setError("");
    setNotice("");
    try {
      const { error: deleteError } = await createClient()
        .from("exams")
        .delete()
        .eq("id", exam.id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      setExams((current) => current.filter((item) => item.id !== exam.id));
      setTasks((current) => current.filter((task) => task.exam_id !== exam.id));
      setManualModules((current) => {
        const next = { ...current };
        delete next[exam.id];
        return next;
      });
      setNotice("Subject deleted.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Could not delete this subject."));
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

  async function buildAndSavePlan() {
    setError("");
    setNotice("");
    setWarnings([]);
    setSummaries([]);
    if (exams.length === 0) {
      setError("Add a subject before building your plan.");
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
        modules: resolution.modules,
      });
    }

    const hoursPerDay = Number(settings.hoursPerDay);
    if (!Number.isFinite(hoursPerDay) || hoursPerDay < 0.5 || hoursPerDay > 16) {
      setError("Study hours must be between 0.5 and 16.");
      return;
    }

    setBuildingPlan(true);
    try {
      const plan = buildPlan(planExams, {
        hoursPerDay,
        daysOff: settings.daysOff,
        startDate: getLocalDateString(new Date()),
      });
      setWarnings(plan.warnings);
      setSummaries(
        plan.summaries.map((summary) => ({
          subject: summary.subject,
          plannedMinutes: summary.plannedMinutes,
          unscheduledMinutes: summary.unscheduledMinutes,
        }))
      );

      const supabase = createClient();
      const { data: currentData, error: readError } = await supabase
        .from("plan_tasks")
        .select(TASK_COLUMNS)
        .order("task_date", { ascending: true })
        .order("position", { ascending: true });
      if (readError) {
        setError(readError.message);
        return;
      }
      const previous = parseRows(currentData as unknown, parseTask);
      if (previous.invalid) {
        setError("Your current plan could not be read, so it was not replaced.");
        return;
      }
      if (
        previous.rows.length > 0 &&
        !window.confirm("This replaces your current plan, including ticks. Continue?")
      ) {
        return;
      }

      if (previous.rows.length > 0) {
        const { error: deleteError } = await supabase
          .from("plan_tasks")
          .delete()
          .in(
            "id",
            previous.rows.map((task) => task.id)
          );
        if (deleteError) {
          setError(deleteError.message);
          return;
        }
      }

      const newRows: PlanTaskInput[] = plan.tasks.map((task) => ({
        exam_id: task.examId,
        module: task.module,
        title: task.title,
        kind: task.kind,
        pages: task.pages,
        task_date: task.taskDate,
        minutes: Math.max(5, Math.round(task.minutes)),
        done: false,
        done_at: null,
        position: task.position,
      }));

      if (newRows.length === 0) {
        setTasks([]);
        setNotice("Your plan is saved, but there are no tasks to show.");
        return;
      }

      const { data: insertedData, error: insertError } = await supabase
        .from("plan_tasks")
        .insert(newRows)
        .select(TASK_COLUMNS);
      if (insertError) {
        const oldRows = previous.rows.map(toTaskInput);
        if (oldRows.length > 0) {
          const { data: restoredData, error: restoreError } = await supabase
            .from("plan_tasks")
            .insert(oldRows)
            .select(TASK_COLUMNS);
          if (restoreError) {
            setError(
              `${insertError.message} The previous plan could not be restored: ${restoreError.message}`
            );
            return;
          }
          const restored = parseRows(restoredData as unknown, parseTask);
          if (restored.invalid) {
            setError(
              `${insertError.message} The previous plan was restored, but its details could not be read.`
            );
            return;
          }
          setTasks(restored.rows);
        }
        setError(
          oldRows.length > 0
            ? `${insertError.message} Your previous plan was restored.`
            : insertError.message
        );
        return;
      }

      const inserted = parseRows(insertedData as unknown, parseTask);
      if (inserted.invalid) {
        setError("The plan was saved, but the saved tasks could not be read.");
        return;
      }
      setTasks(
        inserted.rows.sort((a, b) =>
          a.task_date === b.task_date
            ? a.position - b.position
            : a.task_date.localeCompare(b.task_date)
        )
      );
      setNotice("Your study plan is ready.");
    } catch (planError) {
      setError(
        planError instanceof Error
          ? planError.message
          : "Could not build your plan."
      );
    } finally {
      setBuildingPlan(false);
    }
  }

  async function toggleTask(task: PlanTask, done: boolean) {
    setError("");
    const key = String(task.id);
    const doneAt = done ? new Date().toISOString() : null;
    setUpdatingTaskIds((current) => new Set(current).add(key));
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, done, done_at: doneAt }
          : item
      )
    );
    try {
      const { error: updateError } = await createClient()
        .from("plan_tasks")
        .update({ done, done_at: doneAt })
        .eq("id", task.id);
      if (updateError) {
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
  const completedTasks = tasks.filter((task) => task.done).length;
  const progress = tasks.length
    ? Math.round((completedTasks / tasks.length) * 100)
    : 0;
  const tasksByDate = new Map<string, PlanTask[]>();
  for (const task of tasks) {
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
            {modulesByExam.map(({ exam, resolution }) => (
              <div
                key={exam.id}
                className="rounded-xl border border-[var(--border)] p-4"
              >
                <h3 className="font-semibold">{exam.subject}</h3>
                {resolution.manual ? (
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
                  </>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                    {resolution.modules.map((module, index) => (
                      <li key={`${module.name}-${index}`}>
                        {module.name} — {module.pages} pages
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Your study plan</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {completedTasks} of {tasks.length} tasks done ({progress}%)
              </p>
            </div>
            <button
              type="button"
              onClick={() => void buildAndSavePlan()}
              disabled={buildingPlan || exams.length === 0}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {buildingPlan ? "Building..." : "Build my plan"}
            </button>
          </div>

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

          {tasks.length === 0 ? (
            <p className="mt-5 text-sm text-[var(--muted)]">
              No plan yet. Add subjects and modules, then build your plan.
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
                            disabled={updatingTaskIds.has(taskKey)}
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
      </div>
    </main>
  );
}
