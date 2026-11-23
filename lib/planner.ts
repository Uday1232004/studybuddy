// One topic found inside a module (this is what the AI scan will give us).
export type PlannerTopic = {
  title: string;
  startPage: number;
  endPage: number;
  difficulty: number; // 1-5
  priority: number; // 1 = study first
};

export type PlannerModule = {
  name: string;
  pages: number;
  topics?: PlannerTopic[]; // optional: without topics the whole module is one block
  priority?: number; // optional: lower = study this module earlier (default: list order)
};

export type PlannerExam = {
  id: string;
  subject: string;
  examDate: string; // YYYY-MM-DD
  credits: number; // 1-10
  difficulty: number; // 1-5
  modules: PlannerModule[];
};

export type PlannerSettings = {
  hoursPerDay: number;
  daysOff: number[]; // 0 = Sunday ... 6 = Saturday
  startDate: string; // YYYY-MM-DD, usually today
};

export type TaskKind = "learn" | "revise";

export type PlannedTask = {
  examId: string;
  module: string | null;
  title: string;
  kind: TaskKind;
  pages: string | null;
  taskDate: string;
  minutes: number;
  position: number;
};

export type ExamSummary = {
  examId: string;
  subject: string;
  studyDays: number;
  plannedMinutes: number;
  unscheduledMinutes: number;
};

export type PlanResult = {
  tasks: PlannedTask[];
  warnings: string[];
  summaries: ExamSummary[];
};

const DAY_MS = 86_400_000;
export const MINUTES_PER_PAGE = 6; // base pace, scaled by difficulty
export const REVISION_SHARE = 0.25; // revision = 25% of learning time...
export const MIN_REVISION_MINUTES = 60; // ...but never less than this
export const MAX_SESSION_MINUTES = 90; // one task never gets longer than this

// ---------- small helpers ----------

function parseDay(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d
  ) {
    throw new Error(`Invalid date: ${s}`);
  }
  return Math.round(t / DAY_MS);
}

function formatDay(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

function weekday(n: number): number {
  return new Date(n * DAY_MS).getUTCDay();
}

function clampInt(v: number, min: number, max: number, fallback: number): number {
  const n = Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ---------- per-exam state ----------

// One block of study: a whole module, or one topic inside a module.
type Unit = {
  moduleName: string;
  title: string | null; // null = the whole module (no topic)
  start: number; // first page (absolute, 1-based)
  count: number; // number of pages
  total: number; // minutes for the whole block
};

type ExamState = {
  exam: PlannerExam;
  examDay: number;
  days: number[]; // study days, in order
  dayIndex: Map<number, number>;
  units: Unit[];
  unitIdx: number; // which block we are on
  pageDone: number; // pages finished in that block
  learnTotal: number;
  learnPlanned: number;
  learnDays: number; // how many days the learning is spread over
  reviseDays: number; // how many last days hold revision
  reviseTotal: number;
  revisePlanned: number;
  weight: number;
  planned: number;
};

// Minutes for pages a..b of a block (a and b count from 1 inside the block).
// Uses cumulative rounding so the pieces of a block add up to exactly its total.
function minutesFor(unit: Unit, a: number, b: number): number {
  return (
    Math.round((unit.total * b) / unit.count) -
    Math.round((unit.total * (a - 1)) / unit.count)
  );
}

function tenthsFor(difficulty: number): number {
  // difficulty 1 -> x0.9 ... difficulty 5 -> x1.3 (whole tenths, no float errors)
  return 9 + (difficulty - 1);
}

function minutesForPages(pages: number, difficulty: number): number {
  return Math.ceil((pages * MINUTES_PER_PAGE * tenthsFor(difficulty)) / 10);
}

const LATE = 1_000_000; // sorts after every real priority

// Turn one module into blocks of study: its topics in the AI's order, with
// any pages the topics missed added at the end, so every page is planned once.
function buildUnits(mod: PlannerModule, examDifficulty: number): Unit[] {
  const pages = Math.floor(mod.pages);
  if (!Number.isFinite(pages) || pages < 1) return [];

  const whole = (): Unit[] => [
    {
      moduleName: mod.name,
      title: null,
      start: 1,
      count: pages,
      total: minutesForPages(pages, examDifficulty),
    },
  ];

  if (!mod.topics || mod.topics.length === 0) return whole();

  type Raw = { title: string; start: number; end: number; difficulty: number; priority: number };
  const raw: Raw[] = [];
  for (const t of mod.topics) {
    const start = Math.max(1, Math.floor(t.startPage));
    const end = Math.min(pages, Math.floor(t.endPage));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const title = String(t.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Topic";
    raw.push({
      title,
      start,
      end,
      difficulty: clampInt(t.difficulty, 1, 5, examDifficulty),
      priority: Number.isFinite(t.priority) ? t.priority : LATE,
    });
  }
  if (raw.length === 0) return whole();

  raw.sort((a, b) => a.start - b.start || a.end - b.end);

  type Block = Raw & { gap: boolean };
  const blocks: Block[] = [];
  let covered = 0; // highest page already given to a block
  for (const t of raw) {
    const start = Math.max(t.start, covered + 1);
    if (start > t.end) continue; // fully inside an earlier topic
    if (start > covered + 1) {
      blocks.push({ title: "Other pages", start: covered + 1, end: start - 1, difficulty: examDifficulty, priority: LATE, gap: true });
    }
    blocks.push({ ...t, start, gap: false });
    covered = t.end;
  }
  if (covered < pages) {
    blocks.push({ title: "Other pages", start: covered + 1, end: pages, difficulty: examDifficulty, priority: LATE, gap: true });
  }

  blocks.sort((a, b) => a.priority - b.priority || a.start - b.start);
  return blocks.map((b) => {
    const count = b.end - b.start + 1;
    return {
      moduleName: mod.name,
      title: b.title,
      start: b.start,
      count,
      total: minutesForPages(count, b.difficulty),
    };
  });
}

function pageLabel(a: number, b: number): string {
  return a === b ? `${a}` : `${a}-${b}`;
}

export function buildPlan(
  exams: PlannerExam[],
  settings: PlannerSettings
): PlanResult {
  const startDay = parseDay(settings.startDate);
  const dailyMinutes = Math.max(0, Math.round(settings.hoursPerDay * 60));
  const off = new Set(settings.daysOff);

  const tasks: PlannedTask[] = [];
  const warnings: string[] = [];
  const summaries: ExamSummary[] = [];
  const states: ExamState[] = [];

  for (const exam of exams) {
    const examDay = parseDay(exam.examDate);

    const days: number[] = [];
    for (let d = startDay; d < examDay; d++) {
      if (!off.has(weekday(d))) days.push(d);
    }

    if (days.length === 0) {
      warnings.push(
        `${exam.subject}: there are no study days before the exam on ${exam.examDate}, so it was skipped.`
      );
      summaries.push({
        examId: exam.id,
        subject: exam.subject,
        studyDays: 0,
        plannedMinutes: 0,
        unscheduledMinutes: 0,
      });
      continue;
    }

    const difficulty = clampInt(exam.difficulty, 1, 5, 3);
    const credits = clampInt(exam.credits, 1, 10, 3);

    // Modules in study order, each cut into blocks.
    const ordered = exam.modules
      .map((m, i) => ({ m, i, order: Number.isFinite(m.priority) ? (m.priority as number) : i }))
      .sort((a, b) => a.order - b.order || a.i - b.i);
    const units: Unit[] = ordered.flatMap(({ m }) => buildUnits(m, difficulty));

    if (units.length === 0) {
      warnings.push(
        `${exam.subject}: no module pages were found, so it was skipped. Link a chat with PDFs first.`
      );
      summaries.push({
        examId: exam.id,
        subject: exam.subject,
        studyDays: days.length,
        plannedMinutes: 0,
        unscheduledMinutes: 0,
      });
      continue;
    }

    const learnTotal = units.reduce((sum, u) => sum + u.total, 0);
    const reviseTotal = Math.max(
      MIN_REVISION_MINUTES,
      Math.ceil(learnTotal * REVISION_SHARE)
    );

    // Revision lives on the last 1-2 study days; learning is spread over the rest.
    const n = days.length;
    const reviseDays = n >= 5 ? 2 : 1;
    const learnDays = n === 1 ? 1 : n - reviseDays;

    states.push({
      exam,
      examDay,
      days,
      dayIndex: new Map(days.map((d, i) => [d, i])),
      units,
      unitIdx: 0,
      pageDone: 0,
      learnTotal,
      learnPlanned: 0,
      learnDays,
      reviseDays,
      reviseTotal,
      revisePlanned: 0,
      weight: 1 + (credits - 3) * 0.05 + (difficulty - 3) * 0.05,
      planned: 0,
    });
  }

  const allDays = Array.from(new Set(states.flatMap((s) => s.days))).sort(
    (a, b) => a - b
  );

  const remainingOf = (s: ExamState) =>
    s.learnTotal - s.learnPlanned + (s.reviseTotal - s.revisePlanned);

  for (const day of allDays) {
    let capacity = dailyMinutes;
    let position = 0;

    const daysLeft = (s: ExamState) => s.days.length - (s.dayIndex.get(day) ?? 0);
    const pressure = (s: ExamState) => (remainingOf(s) / daysLeft(s)) * s.weight;

    // Who gets the day's time first: an exam on its last study day, then the
    // one under the most pressure, then the earliest exam.
    const today = states
      .filter((s) => s.dayIndex.has(day))
      .sort((a, b) => {
        const ua = daysLeft(a) === 1 ? 1 : 0;
        const ub = daysLeft(b) === 1 ? 1 : 0;
        if (ua !== ub) return ub - ua;
        const dp = pressure(b) - pressure(a);
        if (Math.abs(dp) > 1e-9) return dp;
        if (a.examDay !== b.examDay) return a.examDay - b.examDay;
        return a.exam.id < b.exam.id ? -1 : a.exam.id > b.exam.id ? 1 : 0;
      });

    for (const s of today) {
      const idx = s.dayIndex.get(day) as number;
      const subject = s.exam.subject;

      // ----- learning: take today's even share of the pages -----
      if (s.learnPlanned < s.learnTotal && capacity > 0) {
        const target =
          idx < s.learnDays
            ? (s.learnTotal * (idx + 1)) / s.learnDays
            : s.learnTotal;
        let used = 0;

        while (s.unitIdx < s.units.length) {
          const unit = s.units[s.unitIdx];
          const start = s.pageDone + 1;
          const perPage = unit.total / unit.count;
          let end = s.pageDone;

          while (end < unit.count) {
            const cost = minutesFor(unit, start, end + 1);
            if (used + cost > capacity) break;
            if (s.learnPlanned + used + cost - perPage / 2 > target + 1e-9) break;
            end++;
          }
          if (end < start) break;

          const pieceMinutes = minutesFor(unit, start, end);
          const count = end - start + 1;
          const parts = Math.min(count, Math.ceil(pieceMinutes / MAX_SESSION_MINUTES));
          for (let i = 0; i < parts; i++) {
            const a = start + Math.floor((count * i) / parts);
            const b = start + Math.floor((count * (i + 1)) / parts) - 1;
            const first = unit.start + a - 1; // real page numbers in the PDF
            const last = unit.start + b - 1;
            const word = first === last ? "page" : "pages";
            const where = `${word} ${pageLabel(first, last)}`;
            tasks.push({
              examId: s.exam.id,
              module: unit.moduleName,
              title:
                unit.title === null
                  ? `${subject}: ${unit.moduleName}, ${where}`
                  : `${subject}: ${unit.title} (${unit.moduleName}, ${where})`,
              kind: "learn",
              pages: pageLabel(first, last),
              taskDate: formatDay(day),
              minutes: minutesFor(unit, a, b),
              position: position++,
            });
          }

          used += pieceMinutes;
          s.pageDone = end;
          if (end === unit.count) {
            s.unitIdx++;
            s.pageDone = 0;
          } else {
            break; // today's share is used up
          }
        }

        capacity -= used;
        s.learnPlanned += used;
        s.planned += used;
      }

      // ----- revision: only after learning is done, only on the last days -----
      const reviseIdx = idx - (s.days.length - s.reviseDays);
      if (reviseIdx >= 0 && s.learnPlanned >= s.learnTotal && capacity > 0) {
        const target = Math.round((s.reviseTotal * (reviseIdx + 1)) / s.reviseDays);
        const minutes = Math.min(capacity, target - s.revisePlanned);
        if (minutes > 0) {
          const dayLabel =
            s.reviseDays > 1 ? ` (day ${reviseIdx + 1} of ${s.reviseDays})` : "";
          // Usually one block; only a very long one is cut into sessions.
          const parts = Math.ceil(minutes / MAX_SESSION_MINUTES);
          for (let i = 0; i < parts; i++) {
            const part =
              Math.round((minutes * (i + 1)) / parts) -
              Math.round((minutes * i) / parts);
            const partLabel = parts > 1 ? ` [part ${i + 1} of ${parts}]` : "";
            tasks.push({
              examId: s.exam.id,
              module: null,
              title: `Revise ${subject}: key points and quiz${dayLabel}${partLabel}`,
              kind: "revise",
              pages: null,
              taskDate: formatDay(day),
              minutes: part,
              position: position++,
            });
          }
          capacity -= minutes;
          s.revisePlanned += minutes;
          s.planned += minutes;
        }
      }
    }
  }

  for (const s of states) {
    const remaining = remainingOf(s);
    summaries.push({
      examId: s.exam.id,
      subject: s.exam.subject,
      studyDays: s.days.length,
      plannedMinutes: s.planned,
      unscheduledMinutes: remaining,
    });

    if (remaining > 0) {
      const extra = Math.ceil(remaining / s.days.length);
      warnings.push(
        `Not enough time for ${s.exam.subject}: about ${formatHours(remaining)} of work will not fit before the exam on ${s.exam.examDate}. Add roughly ${extra} more minutes per day, or move the exam.`
      );
    }
  }

  return { tasks, warnings, summaries };
}
