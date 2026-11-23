import assert from "node:assert/strict";
import { buildPlan } from "../lib/planner.ts";

const settings = (extra = {}) => ({
  hoursPerDay: 4,
  daysOff: [],
  startDate: "2026-11-23",
  ...extra,
});

const exam = (extra = {}) => ({
  id: "e1",
  subject: "DBMS",
  examDate: "2026-11-30",
  credits: 3,
  difficulty: 3,
  modules: [{ name: "Module 1", pages: 30 }],
  ...extra,
});

const sum = (tasks, kind) =>
  tasks.filter((t) => !kind || t.kind === kind).reduce((a, t) => a + t.minutes, 0);

const perDay = (tasks) => {
  const map = new Map();
  for (const t of tasks) map.set(t.taskDate, (map.get(t.taskDate) ?? 0) + t.minutes);
  return map;
};

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok -", name);
}

test("a single exam is fully planned before the exam day", () => {
  const { tasks, warnings } = buildPlan([exam()], settings());
  assert.equal(warnings.length, 0);
  assert.equal(sum(tasks, "learn"), 198);
  assert.equal(sum(tasks, "revise"), 60);
  for (const t of tasks) {
    assert.ok(t.taskDate >= "2026-11-23" && t.taskDate <= "2026-11-29");
  }
  for (const t of tasks.filter((x) => x.kind === "revise")) {
    assert.ok(t.taskDate >= "2026-11-28");
  }
});

test("page ranges are in order and cover every page once", () => {
  const { tasks } = buildPlan([exam()], settings());
  let next = 1;
  for (const t of tasks.filter((x) => x.kind === "learn")) {
    const [a, b] = t.pages.split("-").map(Number);
    assert.equal(a, next);
    next = (b ?? a) + 1;
  }
  assert.equal(next, 31);
});

test("days off are respected", () => {
  const { tasks } = buildPlan([exam({ examDate: "2026-12-01" })], settings({ daysOff: [0] }));
  assert.ok(tasks.length > 0);
  assert.ok(!tasks.some((t) => t.taskDate === "2026-11-29"));
});

test("warns when there is not enough time and never overfills a day", () => {
  const { tasks, warnings, summaries } = buildPlan(
    [exam({ examDate: "2026-11-26", difficulty: 5, modules: [{ name: "Big", pages: 60 }] })],
    settings({ hoursPerDay: 1 })
  );
  assert.ok(warnings.some((w) => w.includes("Not enough time")));
  assert.ok(summaries[0].unscheduledMinutes > 0);
  for (const [, minutes] of perDay(tasks)) assert.ok(minutes <= 60);
});

test("an exam that is today or in the past is skipped with a warning", () => {
  const { tasks, warnings } = buildPlan([exam({ examDate: "2026-11-23" })], settings());
  assert.equal(tasks.length, 0);
  assert.ok(warnings.length > 0);
});

test("an exam without modules is skipped with a warning", () => {
  const { tasks, warnings } = buildPlan([exam({ modules: [] })], settings());
  assert.equal(tasks.length, 0);
  assert.ok(warnings.length > 0);
});

test("two exams share the days and no day is overfilled", () => {
  const exams = [
    exam({ id: "a", subject: "DBMS", examDate: "2026-11-28" }),
    exam({
      id: "b",
      subject: "OS",
      examDate: "2026-12-04",
      modules: [{ name: "M1", pages: 40 }, { name: "M2", pages: 40 }],
    }),
  ];
  const { tasks } = buildPlan(exams, settings({ hoursPerDay: 3 }));
  for (const [, minutes] of perDay(tasks)) assert.ok(minutes <= 180);
  assert.ok(tasks.some((t) => t.examId === "a"));
  assert.ok(tasks.some((t) => t.examId === "b"));
  for (const t of tasks.filter((x) => x.examId === "a")) assert.ok(t.taskDate < "2026-11-28");
  for (const t of tasks.filter((x) => x.examId === "b")) assert.ok(t.taskDate < "2026-12-04");
});

test("the same input always gives the same plan", () => {
  assert.deepEqual(buildPlan([exam()], settings()), buildPlan([exam()], settings()));
});

test("invalid dates throw an error", () => {
  assert.throws(() => buildPlan([exam({ examDate: "2026-13-40" })], settings()));
});

test("every task title says which subject it belongs to", () => {
  const exams = [
    exam({ id: "a", subject: "DBMS" }),
    exam({ id: "b", subject: "Operating Systems", examDate: "2026-12-02" }),
  ];
  const { tasks } = buildPlan(exams, settings());
  for (const t of tasks) {
    const subject = t.examId === "a" ? "DBMS" : "Operating Systems";
    assert.ok(t.title.includes(subject), `missing subject in: ${t.title}`);
  }
});

test("learning is spread evenly, not crammed into the first days", () => {
  const { tasks } = buildPlan([exam({ examDate: "2026-12-07" })], settings());
  const learn = perDay(tasks.filter((t) => t.kind === "learn"));
  // learning days are 11-23 .. 12-04 (12 days); every one of them gets work
  assert.equal(learn.size, 12);
  const values = [...learn.values()];
  assert.ok(Math.max(...values) - Math.min(...values) <= 25);
});

test("revision is one block per day on the last two days, not split on one day", () => {
  const { tasks } = buildPlan([exam()], settings());
  const revise = tasks.filter((t) => t.kind === "revise");
  assert.equal(revise.length, 2);
  assert.deepEqual(revise.map((t) => t.taskDate), ["2026-11-28", "2026-11-29"]);
});

test("the day before each exam always has revision on it", () => {
  const exams = [
    exam({ id: "a", subject: "DBMS", examDate: "2026-11-30" }),
    exam({ id: "b", subject: "OS", examDate: "2026-12-02" }),
  ];
  const { tasks } = buildPlan(exams, settings());
  assert.ok(tasks.some((t) => t.examId === "a" && t.kind === "revise" && t.taskDate === "2026-11-29"));
  assert.ok(tasks.some((t) => t.examId === "b" && t.kind === "revise" && t.taskDate === "2026-12-01"));
});

test("no task is longer than 90 minutes and every task has minutes", () => {
  const { tasks } = buildPlan(
    [exam({ modules: [{ name: "Huge", pages: 200 }], examDate: "2026-12-05" })],
    settings({ hoursPerDay: 6 })
  );
  for (const t of tasks) assert.ok(t.minutes > 0 && t.minutes <= 90, t.title);
});

// ---- tests for AI topics (difficulty and study order) ----

const topicExam = (topics, extra = {}) =>
  exam({
    examDate: "2026-12-07",
    modules: [{ name: "Module 1", pages: 30, topics }],
    ...extra,
  });

const learnOf = (tasks) => tasks.filter((t) => t.kind === "learn");

const pagesCovered = (tasks) => {
  const seen = [];
  for (const t of learnOf(tasks)) {
    const [a, b] = t.pages.split("-").map(Number);
    for (let p = a; p <= (b ?? a); p++) seen.push(p);
  }
  return seen.sort((x, y) => x - y);
};

test("topics are studied in the order the AI ranked them", () => {
  const { tasks } = buildPlan(
    [
      topicExam([
        { title: "Basics", startPage: 1, endPage: 10, difficulty: 2, priority: 3 },
        { title: "Joins", startPage: 11, endPage: 20, difficulty: 4, priority: 1 },
        { title: "Indexes", startPage: 21, endPage: 30, difficulty: 3, priority: 2 },
      ]),
    ],
    settings()
  );
  const order = [];
  for (const t of learnOf(tasks)) {
    const name = ["Joins", "Indexes", "Basics"].find((n) => t.title.includes(n));
    if (!order.includes(name)) order.push(name);
  }
  assert.deepEqual(order, ["Joins", "Indexes", "Basics"]);
  assert.ok(learnOf(tasks)[0].title.startsWith("DBMS: Joins (Module 1, pages 11-"));
});

test("every page is planned exactly once, even if topics have gaps or overlap", () => {
  const { tasks } = buildPlan(
    [
      topicExam([
        { title: "A", startPage: 1, endPage: 10, difficulty: 3, priority: 1 },
        { title: "B", startPage: 8, endPage: 14, difficulty: 3, priority: 2 }, // overlaps A
        { title: "C", startPage: 20, endPage: 40, difficulty: 3, priority: 3 }, // gap 15-19, runs past the end
      ]),
    ],
    settings()
  );
  const pages = pagesCovered(tasks);
  assert.equal(pages.length, 30);
  assert.deepEqual(pages, Array.from({ length: 30 }, (_, i) => i + 1));
});

test("harder topics get more minutes per page", () => {
  const { tasks } = buildPlan(
    [
      topicExam([
        { title: "Easy", startPage: 1, endPage: 15, difficulty: 1, priority: 1 },
        { title: "Hard", startPage: 16, endPage: 30, difficulty: 5, priority: 2 },
      ]),
    ],
    settings()
  );
  const easy = sum(learnOf(tasks).filter((t) => t.title.includes("Easy")));
  const hard = sum(learnOf(tasks).filter((t) => t.title.includes("Hard")));
  assert.equal(easy, 81); // 15 pages x 6 min x 0.9
  assert.equal(hard, 117); // 15 pages x 6 min x 1.3
});

test("bad topic data is cleaned up instead of crashing", () => {
  const { tasks, warnings } = buildPlan(
    [
      topicExam([
        { title: "   ", startPage: 1, endPage: 10, difficulty: 99, priority: NaN },
        { title: "Broken", startPage: 20, endPage: 5, difficulty: 3, priority: 1 },
      ]),
    ],
    settings()
  );
  assert.equal(warnings.length, 0);
  assert.equal(pagesCovered(tasks).length, 30);
  for (const t of tasks) assert.ok(t.minutes > 0 && t.title.length > 0);
});

test("a module with no topics still works like before", () => {
  const withTopics = buildPlan([topicExam([])], settings());
  const without = buildPlan([exam({ examDate: "2026-12-07" })], settings());
  assert.deepEqual(withTopics, without);
});

test("modules can be ordered with priority", () => {
  const { tasks } = buildPlan(
    [
      exam({
        examDate: "2026-12-07",
        modules: [
          { name: "Module 1", pages: 10 },
          { name: "Module 2", pages: 10, priority: -1 },
        ],
      }),
    ],
    settings()
  );
  assert.equal(learnOf(tasks)[0].module, "Module 2");
});

console.log(`\n${passed} tests passed`);
