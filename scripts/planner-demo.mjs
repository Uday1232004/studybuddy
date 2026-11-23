import { buildPlan } from "../lib/planner.ts";

const exams = [
  { id: "dbms", subject: "DBMS", examDate: "2026-11-30", credits: 4, difficulty: 4,
    modules: [{ name: "Module 1", pages: 24 }, { name: "Module 2", pages: 30 }] },
  { id: "os", subject: "Operating Systems", examDate: "2026-12-02", credits: 3, difficulty: 3,
    modules: [{ name: "Module 1", pages: 40 }] },
];

const { tasks, warnings, summaries } = buildPlan(exams, {
  hoursPerDay: 4, daysOff: [], startDate: "2026-11-23",
});

let current = "";
const totals = new Map();
for (const t of tasks) totals.set(t.taskDate, (totals.get(t.taskDate) ?? 0) + t.minutes);
for (const t of tasks) {
  if (t.taskDate !== current) {
    current = t.taskDate;
    console.log(`\n${current}  (total ${totals.get(current)} min)`);
  }
  console.log(` ${t.kind.padEnd(6)} ${String(t.minutes).padStart(3)} min  ${t.title}`);
}
console.log("\nWarnings:", warnings.length ? warnings : "none");
console.log("Summaries:", summaries);
