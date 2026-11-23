export type PlannerModule = { name: string; pages: number };

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

type ModState = { name: string; pages: number; total: number };

type ExamState = {
  exam: PlannerExam;
  examDay: number;
  days: number[]; // study days, in order
  dayIndex: Map<number, number>;
  mods: ModState[];
  modIdx: number; // which module we are on
  pageDone: number; // pages finished in that module
  learnTotal: number;
  learnPlanned: number;
  learnDays: number; // how many days the learning is spread over
  reviseDays: number; // how many last days hold revision
  reviseTotal: number;
  revisePlanned: number;
  weight: number;
  planned: number;
};

// Minutes for pages a..b of a module. Uses cumulative rounding so the pieces
// of a module always add up to exactly the module's total.
function minutesFor(mod: ModState, a: number, b: number): number {
  return (
    Math.round((mod.total * b) / mod.pages) -
    Math.round((mod.total * (a - 1)) / mod.pages)
  );
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
    // difficulty 1 -> x0.9 ... difficulty 5 -> x1.3 (whole tenths, no float errors)
    const tenths = 9 + (difficulty - 1);

    const mods: ModState[] = [];
    for (const m of exam.modules) {
      const pages = Math.floor(m.pages);
      if (!Number.isFinite(pages) || pages < 1) continue;
      mods.push({
        name: m.name,
        pages,
        total: Math.ceil((pages * MINUTES_PER_PAGE * tenths) / 10),
      });
    }

    if (mods.length === 0) {
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

    const learnTotal = mods.reduce((sum, m) => sum + m.total, 0);
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
      mods,
      modIdx: 0,
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

        while (s.modIdx < s.mods.length) {
          const mod = s.mods[s.modIdx];
          const start = s.pageDone + 1;
          const perPage = mod.total / mod.pages;
          let end = s.pageDone;

          while (end < mod.pages) {
            const cost = minutesFor(mod, start, end + 1);
            if (used + cost > capacity) break;
            if (s.learnPlanned + used + cost - perPage / 2 > target + 1e-9) break;
            end++;
          }
          if (end < start) break;

          const pieceMinutes = minutesFor(mod, start, end);
          const count = end - start + 1;
          const parts = Math.min(count, Math.ceil(pieceMinutes / MAX_SESSION_MINUTES));
          for (let i = 0; i < parts; i++) {
            const a = start + Math.floor((count * i) / parts);
            const b = start + Math.floor((count * (i + 1)) / parts) - 1;
            tasks.push({
              examId: s.exam.id,
              module: mod.name,
              title: `${subject}: ${mod.name}, ${a === b ? "page" : "pages"} ${pageLabel(a, b)}`,
              kind: "learn",
              pages: pageLabel(a, b),
              taskDate: formatDay(day),
              minutes: minutesFor(mod, a, b),
              position: position++,
            });
          }

          used += pieceMinutes;
          s.pageDone = end;
          if (end === mod.pages) {
            s.modIdx++;
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
