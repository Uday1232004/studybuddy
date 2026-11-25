import assert from "node:assert/strict";
import { validateTimetable } from "../lib/timetable.ts";

const row = (extra = {}) => ({
  subject: "Database Systems",
  code: "CS301",
  examDate: "2026-11-12",
  examTime: "10:00 AM",
  difficultyGuess: 4,
  confidence: "high",
  note: "Room to be announced",
  ...extra,
});

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok -", name);
}

test("valid rows pass through with normalized optional values", () => {
  assert.deepEqual(validateTimetable({ rows: [row()] }).rows, [row()]);
});

test("a bare array of rows is accepted", () => {
  assert.deepEqual(validateTimetable([row()]).rows, [row()]);
});

test("garbage input returns no rows without throwing", () => {
  assert.deepEqual(validateTimetable("not timetable data").rows, []);
});

test("invalid dates become null", () => {
  assert.equal(validateTimetable([row({ examDate: "not-a-date" })]).rows[0].examDate, null);
});

test("impossible calendar dates become null", () => {
  assert.equal(validateTimetable([row({ examDate: "2026-02-30" })]).rows[0].examDate, null);
});

test("day-first dates must be converted before validation", () => {
  assert.equal(validateTimetable([row({ examDate: "12/11/2026" })]).rows[0].examDate, null);
});

test("difficulty guesses outside the 1 to 5 range become null", () => {
  assert.equal(
    validateTimetable([row({ difficultyGuess: 6 })]).rows[0].difficultyGuess,
    null
  );
});

test("duplicate subjects on the same date are removed ignoring case", () => {
  const result = validateTimetable([
    row(),
    row({ subject: "  DATABASE SYSTEMS  " }),
  ]);
  assert.equal(result.rows.length, 1);
  assert.match(result.warnings.join(" "), /duplicate/);
});

test("empty or overlong subject names are dropped", () => {
  const result = validateTimetable([
    row({ subject: "" }),
    row({ subject: "x".repeat(81) }),
    row(),
  ]);
  assert.deepEqual(result.rows, [row()]);
  assert.match(result.warnings.join(" "), /Skipped 2/);
});

test("more than 40 unique rows are capped with a warning", () => {
  const result = validateTimetable(
    Array.from({ length: 41 }, (_, index) =>
      row({ subject: `Subject ${index + 1}` })
    )
  );
  assert.equal(result.rows.length, 40);
  assert.match(result.warnings.join(" "), /first 40/);
});

test("unknown confidence values default to low", () => {
  assert.equal(
    validateTimetable([row({ confidence: "certain" })]).rows[0].confidence,
    "low"
  );
});

test("optional text is trimmed and constrained to its maximum length", () => {
  const result = validateTimetable([
    row({
      code: ` ${"c".repeat(25)} `,
      examTime: " 11:30 PM + extra details ",
      note: ` ${"n".repeat(140)} `,
    }),
  ]).rows[0];
  assert.equal(result.code?.length, 20);
  assert.equal(result.examTime?.length, 20);
  assert.equal(result.note?.length, 120);
});

console.log(`${passed} tests passed`);
