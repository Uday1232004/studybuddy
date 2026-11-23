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
export const MINUTES_PER_PAGE = 6;
const MAX_CHUNK_MINUTES = 90;
const MIN_REVISE_MINUTES = 60;
const MAX_REVISE_CHUNK_MINUTES = 60;

type Chunk = {
  module: string | null;
  title: string;
  kind: TaskKind;
  pages: string | null;
  minutes: number;
};

type ExamState = {
  exam: PlannerExam;
  examDay: number;
  days: number[];
  daySet: Set<number>;
  queue: Chunk[];
  remaining: number;
  planned: number;
  revisionStart: number;
  weight: number;
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseDay(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
  return ms;
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function localISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pageLabel(start: number, end: number): string {
  return start === end ? `page ${start}` : `pages ${start}-${end}`;
}

function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)} hours`;
}

function buildLearnChunks(exam: PlannerExam, chunkMax: number): Chunk[] {
  const factorTenths = 9 + (clampInt(exam.difficulty, 1, 5) - 1);
  const chunks: Chunk[] = [];

  for (const mod of exam.modules) {
    const pages = Number.isFinite(mod.pages) ? Math.max(1, Math.floor(mod.pages)) : 1;
    const total = Math.max(10, Math.ceil((pages * MINUTES_PER_PAGE * factorTenths) / 10));
    const count = Math.min(pages, Math.max(1, Math.ceil(total / chunkMax)));
    let used = 0;

    for (let i = 0; i < count; i++) {
      const startPage = Math.floor((i * pages) / count) + 1;
      const endPage = Math.floor(((i + 1) * pages) / count);
      const end = Math.round(((i + 1) * total) / count);
      const minutes = Math.max(5, end - used);
      used = end;
      chunks.push({
        module: mod.name,
        title: `${mod.name}: ${pageLabel(startPage, endPage)}`,
        kind: "learn",
        pages: startPage === endPage ? `${startPage}` : `${startPage}-${endPage}`,
        minutes,
      });
    }
  }
  return chunks;
}

function buildReviseChunks(exam: PlannerExam, learnMinutes: number, chunkMax: number): Chunk[] {
  const wanted = Math.max(MIN_REVISE_MINUTES, Math.ceil(learnMinutes / 4));
  const total = Math.ceil(wanted / 15) * 15;
  const size = Math.min(MAX_REVISE_CHUNK_MINUTES, chunkMax);
  const count = Math.max(1, Math.ceil(total / size));
  const chunks: Chunk[] = [];
  let used = 0;

  for (let i = 0; i < count; i++) {
    const end = Math.round(((i + 1) * total) / count);
    const minutes = end - used;
    used = end;
    chunks.push({
      module: null,
      title:
        count === 1
          ? `Revise ${exam.subject}: key points and quiz`
          : `Revise ${exam.subject}: key points and quiz (part ${i + 1} of ${count})`,
      kind: "revise",
      pages: null,
      minutes,
    });
  }
  return chunks;
}

export function buildPlan(exams: PlannerExam[], settings: PlannerSettings): PlanResult {
  const warnings: string[] = [];
  const tasks: PlannedTask[] = [];
  const summaries: ExamSummary[] = [];

  const dailyMinutes = Math.round(settings.hoursPerDay * 60);
  if (!(dailyMinutes >= 30)) {
    warnings.push("Study time per day must be at least 0.5 hours.");
    return { tasks, warnings, summaries };
  }

  const chunkMax = Math.max(30, Math.min(MAX_CHUNK_MINUTES, dailyMinutes));
  const start = parseDay(settings.startDate);
  const daysOff = new Set(settings.daysOff);
  const states: ExamState[] = [];

  for (const exam of exams) {
    const examDay = parseDay(exam.examDate);

    if (examDay - start > 366 * DAY_MS) {
      warnings.push(`${exam.subject}: the exam is more than a year away, so it was skipped.`);
      continue;
    }
    if (exam.modules.length === 0) {
      warnings.push(`${exam.subject}: no modules were found, so it was skipped. Add its PDFs first.`);
      continue;
    }

    const days: number[] = [];
    for (let d = start; d < examDay; d += DAY_MS) {
      if (!daysOff.has(new Date(d).getUTCDay())) days.push(d);
    }
    if (days.length === 0) {
      warnings.push(`${exam.subject}: there are no study days before the exam on ${exam.examDate}, so it was skipped.`);
      summaries.push({ examId: exam.id, subject: exam.subject, studyDays: 0, plannedMinutes: 0, unscheduledMinutes: 0 });
      continue;
    }

    const learn = buildLearnChunks(exam, chunkMax);
    const learnMinutes = learn.reduce((sum, c) => sum + c.minutes, 0);
    const revise = buildReviseChunks(exam, learnMinutes, chunkMax);
    const queue = [...learn, ...revise];

    const credits = clampInt(exam.credits, 1, 10);
    const difficulty = clampInt(exam.difficulty, 1, 5);

    states.push({
      exam,
      examDay,
      days,
      daySet: new Set(days),
      queue,
      remaining: queue.reduce((sum, c) => sum + c.minutes, 0),
      planned: 0,
      revisionStart: days.length >= 2 ? days[days.length - 2] : days[0],
      weight: 1 + (credits - 3) * 0.05 + (difficulty - 3) * 0.05,
    });
  }

  const allDays = Array.from(new Set(states.flatMap((s) => s.days))).sort((a, b) => a - b);

  for (const day of allDays) {
    let capacity = dailyMinutes;
    let position = 0;

    for (;;) {
      let best: ExamState | null = null;
      let bestPressure = -1;

      for (const s of states) {
        const next = s.queue[0];
        if (!next || !s.daySet.has(day)) continue;
        if (next.minutes > capacity) continue;
        if (next.kind === "revise" && day < s.revisionStart) continue;

        const daysLeft = s.days.filter((d) => d >= day).length;
        const pressure = (s.remaining / daysLeft) * s.weight;

        const better =
          best === null ||
          pressure > bestPressure + 1e-9 ||
          (Math.abs(pressure - bestPressure) <= 1e-9 && s.examDay < best.examDay);

        if (better) {
          best = s;
          bestPressure = pressure;
        }
      }

      if (best === null) break;

      const chunk = best.queue.shift();
      if (!chunk) break;

      tasks.push({
        examId: best.exam.id,
        module: chunk.module,
        title: chunk.title,
        kind: chunk.kind,
        pages: chunk.pages,
        taskDate: formatDay(day),
        minutes: chunk.minutes,
        position: position++,
      });
      capacity -= chunk.minutes;
      best.remaining -= chunk.minutes;
      best.planned += chunk.minutes;
    }
  }

  for (const s of states) {
    summaries.push({
      examId: s.exam.id,
      subject: s.exam.subject,
      studyDays: s.days.length,
      plannedMinutes: s.planned,
      unscheduledMinutes: s.remaining,
    });

    if (s.remaining > 0) {
      const extra = Math.ceil(s.remaining / s.days.length);
      warnings.push(
        `Not enough time for ${s.exam.subject}: about ${formatHours(s.remaining)} of work will not fit before the exam on ${s.exam.examDate}. Add roughly ${extra} more minutes per day, or move the exam.`
      );
    }
  }

  return { tasks, warnings, summaries };
}
