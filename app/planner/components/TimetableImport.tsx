"use client";

import { useEffect, useRef, useState } from "react";
import {
  validateTimetable,
  type TimetableRow,
} from "../../../lib/timetable";
import { prepareTimetableFiles } from "../../../lib/timetable-image";

type ExistingExam = {
  id: string;
  subject: string;
  exam_date: string;
};

type AddedExam = {
  id: string;
  subject: string;
  exam_date: string;
};

type ExamInput = {
  subject: string;
  examDate: string;
  credits: number;
  difficulty: number;
};

type MaterialStatus = "has PDF" | "has modules" | "nothing yet";

type ReviewRow = TimetableRow & {
  key: string;
  selected: boolean;
  credits: string;
  difficulty: string;
};

type ValidReviewRow = ReviewRow & {
  examDate: string;
};

type TimetableImportProps = {
  existingExams: ExistingExam[];
  onAddExam: (exam: ExamInput) => Promise<AddedExam>;
  reloadExams: () => Promise<void>;
  getMaterialStatus: (examId: string) => MaterialStatus;
};

const FIELD_CLASS =
  "h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const PRIMARY_BUTTON_CLASS =
  "motion-button inline-flex min-h-10 items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY_BUTTON_CLASS =
  "motion-button inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60";
const DESTRUCTIVE_BUTTON_CLASS =
  "motion-button inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--bad)] bg-[var(--bad-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--bad)] transition-colors hover:bg-[var(--bad)] hover:text-[var(--on-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bad)]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1) return false;
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not add this subject.";
}

function formatShortDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

export default function TimetableImport({
  existingExams,
  onAddExam,
  reloadExams,
  getMaterialStatus,
}: TimetableImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addedExams, setAddedExams] = useState<AddedExam[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const nextRowKeyRef = useRef(0);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  function makeReviewRow(row: TimetableRow): ReviewRow {
    nextRowKeyRef.current += 1;
    return {
      ...row,
      key: `timetable-row-${nextRowKeyRef.current}`,
      selected: row.examDate !== null,
      credits: "3",
      difficulty: String(row.difficultyGuess ?? 3),
    };
  }

  function updateRow(key: string, changes: Partial<ReviewRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...changes } : row))
    );
  }

  async function readTimetable() {
    if (!file || isReading) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsReading(true);
    setError("");
    setNotice("");
    setWarnings([]);
    setRows([]);
    setAddedExams([]);

    try {
      const prepared = await prepareTimetableFiles(file);
      if (controller.signal.aborted) return;
      const response = await fetch("/api/planner/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: prepared.images }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Could not read the timetable. Try a clearer image.";
        throw new Error(message);
      }
      if (
        controller.signal.aborted ||
        !isRecord(payload) ||
        !Array.isArray(payload.rows)
      ) {
        if (!controller.signal.aborted) {
          throw new Error("Could not read the timetable. Try a clearer image.");
        }
        return;
      }

      const result = validateTimetable(payload.rows);
      const serverWarnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter(
            (warning): warning is string => typeof warning === "string"
          )
        : [];
      setRows(result.rows.map((row) => makeReviewRow(row)));
      setWarnings([...new Set([...serverWarnings, ...result.warnings])]);
    } catch (readError) {
      if (!(readError instanceof Error && readError.name === "AbortError")) {
        setError(getErrorMessage(readError));
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsReading(false);
      }
    }
  }

  function cancelRead() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsReading(false);
  }

  const validSelectedRows = rows.filter(
    (row): row is ValidReviewRow => {
      const subject = row.subject.trim();
      const credits = Number(row.credits);
      const difficulty = Number(row.difficulty);
      return (
        row.selected &&
        subject.length >= 1 &&
        subject.length <= 80 &&
        row.examDate !== null &&
        isRealDate(row.examDate) &&
        Number.isInteger(credits) &&
        credits >= 1 &&
        credits <= 10 &&
        Number.isInteger(difficulty) &&
        difficulty >= 1 &&
        difficulty <= 5
      );
    }
  );

  async function addSelectedSubjects() {
    if (validSelectedRows.length === 0 || isAdding) return;
    setIsAdding(true);
    setError("");
    setNotice("");
    setAddedExams([]);

    const added: AddedExam[] = [];
    const failures: string[] = [];
    const seen = new Set<string>();
    let skippedExistingCount = 0;
    let skippedDuplicateCount = 0;

    for (const row of validSelectedRows) {
      const subject = row.subject.trim();
      const examDate = row.examDate;
      const duplicateKey = JSON.stringify([subject.toLowerCase(), examDate]);
      const isExisting = existingExams.some(
        (exam) =>
          exam.subject.trim().toLowerCase() === subject.toLowerCase() &&
          exam.exam_date === examDate
      );
      if (isExisting) {
        skippedExistingCount++;
        continue;
      }
      if (seen.has(duplicateKey)) {
        skippedDuplicateCount++;
        continue;
      }
      seen.add(duplicateKey);

      try {
        added.push(
          await onAddExam({
            subject,
            examDate,
            credits: Number(row.credits),
            difficulty: Number(row.difficulty),
          })
        );
      } catch (addError) {
        failures.push(`${subject}: ${getErrorMessage(addError)}`);
      }
    }

    if (added.length > 0) {
      try {
        await reloadExams();
      } catch (reloadError) {
        failures.push(getErrorMessage(reloadError));
      }
    }

    setAddedExams(added);
    const notices: string[] = [];
    if (added.length > 0) {
      notices.push(
        `Added ${added.length} subject${added.length === 1 ? "" : "s"}.`
      );
    }
    if (skippedExistingCount > 0) {
      notices.push(
        `Skipped ${skippedExistingCount} subject${skippedExistingCount === 1 ? "" : "s"} already in your planner.`
      );
    }
    if (skippedDuplicateCount > 0) {
      notices.push(
        `Skipped ${skippedDuplicateCount} duplicate subject row${skippedDuplicateCount === 1 ? "" : "s"}.`
      );
    }
    setNotice(notices.join(" "));
    if (failures.length > 0) {
      setError(failures.join(" "));
    } else {
      setRows([]);
      setWarnings([]);
    }
    setIsAdding(false);
  }

  return (
    <section className="motion-card min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="text-lg font-bold">Import from timetable</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Upload a photo, screenshot or PDF of your exam timetable. The AI reads
        it, and you check everything before anything is saved.
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        The image is sent to Google&apos;s Gemini to be read. Crop out your name
        and roll number first.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm font-medium">
          Timetable file
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,.pdf,application/pdf"
            disabled={isReading || isAdding}
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setError("");
              setNotice("");
            }}
            className="mt-2 block w-full text-sm text-[var(--text)] file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          />
        </label>
        <button
          type="button"
          onClick={() => void readTimetable()}
          disabled={!file || isReading || isAdding}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isReading ? "Reading your timetable..." : "Read timetable"}
        </button>
        {isReading && (
          <button
            type="button"
            onClick={cancelRead}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </button>
        )}
      </div>
      {!file && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Choose a photo, screenshot or PDF to begin.
        </p>
      )}
      {file && (
        <p className="mt-2 break-all text-xs text-[var(--muted)]">
          Selected: {file.name}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-[var(--text)]">
          {notice}
        </p>
      )}
      {warnings.map((warning, index) => (
        <p
          key={`${index}-${warning}`}
          className="mt-2 text-xs text-[var(--muted)]"
        >
          {warning}
        </p>
      ))}

      {rows.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setRows((current) =>
                  current.map((row) => ({ ...row, selected: true }))
                )
              }
              disabled={isAdding}
              className={SECONDARY_BUTTON_CLASS}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() =>
                setRows((current) =>
                  current.map((row) => ({ ...row, selected: false }))
                )
              }
              disabled={isAdding}
              className={SECONDARY_BUTTON_CLASS}
            >
              Select none
            </button>
            <button
              type="button"
              onClick={() => {
                const newRow = makeReviewRow({
                  subject: "",
                  code: null,
                  examDate: null,
                  examTime: null,
                  difficultyGuess: null,
                  confidence: "low",
                  note: null,
                });
                setRows((current) => [
                  ...current,
                  newRow,
                ]);
              }}
              disabled={isAdding}
              className={SECONDARY_BUTTON_CLASS}
            >
              Add row
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Add
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Subject
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Exam date
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Credits
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Difficulty
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Confidence and note
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row) => {
                  const needsReview =
                    row.examDate === null || row.confidence === "low";
                  return (
                    <tr
                      key={row.key}
                      className={
                        needsReview
                          ? "bg-[var(--bad-bg)]"
                          : "hover:bg-[var(--bg)]"
                      }
                    >
                      <td className="px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(event) =>
                            updateRow(row.key, {
                              selected: event.currentTarget.checked,
                            })
                          }
                          aria-label={`Add ${row.subject || "this subject"}`}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="text"
                          maxLength={80}
                          value={row.subject}
                          onChange={(event) =>
                            updateRow(row.key, {
                              subject: event.currentTarget.value,
                            })
                          }
                          aria-label="Subject name"
                          className={`${FIELD_CLASS} min-w-40`}
                        />
                        {needsReview && (
                          <p className="mt-1 text-xs font-medium text-[var(--bad)]">
                            Check this row
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="date"
                          value={row.examDate ?? ""}
                          onChange={(event) =>
                            updateRow(row.key, {
                              examDate: event.currentTarget.value || null,
                            })
                          }
                          aria-label="Exam date"
                          className={`${FIELD_CLASS} min-w-36`}
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          min="1"
                          max="10"
                          step="1"
                          value={row.credits}
                          onChange={(event) =>
                            updateRow(row.key, {
                              credits: event.currentTarget.value,
                            })
                          }
                          aria-label="Credits, 1 to 10"
                          className={`${FIELD_CLASS} w-20`}
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <label className="flex items-center gap-2">
                          <select
                            value={row.difficulty}
                            onChange={(event) =>
                              updateRow(row.key, {
                                difficulty: event.currentTarget.value,
                              })
                            }
                            aria-label="Difficulty, 1 to 5"
                            className={`${FIELD_CLASS} w-20`}
                          >
                            {[1, 2, 3, 4, 5].map((difficulty) => (
                              <option key={difficulty} value={difficulty}>
                                {difficulty}
                              </option>
                            ))}
                          </select>
                          {row.difficultyGuess !== null && (
                            <span className="whitespace-nowrap text-xs text-[var(--muted)]">
                              AI guess
                            </span>
                          )}
                        </label>
                      </td>
                      <td className="max-w-56 px-3 py-3 align-top">
                        {row.confidence !== "high" && (
                          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--muted)]">
                            {row.confidence} confidence
                          </span>
                        )}
                        {row.note && (
                          <p className="mt-1 break-words text-xs text-[var(--muted)]">
                            {row.note}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <button
                          type="button"
                          onClick={() =>
                            setRows((current) =>
                              current.filter((item) => item.key !== row.key)
                            )
                          }
                          disabled={isAdding}
                          className={DESTRUCTIVE_BUTTON_CLASS}
                        >
                          Delete row
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => void addSelectedSubjects()}
            disabled={validSelectedRows.length === 0 || isAdding}
            className={`${PRIMARY_BUTTON_CLASS} mt-4`}
          >
            {isAdding
              ? "Adding subjects..."
              : `Add ${validSelectedRows.length} selected subjects`}
          </button>
        </div>
      )}

      {addedExams.length > 0 && (
        <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <h3 className="font-semibold">Next steps</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Subjects added. For each one, upload its module PDF so the AI can
            scan it, or add modules by hand. Then click Build my plan.
          </p>
          <ul className="mt-3 space-y-2">
            {addedExams.map((exam) => {
              const status = getMaterialStatus(exam.id);
              return (
                <li
                  key={exam.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3 ${
                    status === "nothing yet" ? "bg-[var(--bad-bg)]" : ""
                  }`}
                >
                  <span className="font-medium">
                    {exam.subject} · {formatShortDate(exam.exam_date)}
                  </span>
                  <span className="text-sm text-[var(--muted)]">{status}</span>
                </li>
              );
            })}
          </ul>
          <a
            href="#modules-for-your-plan"
            className="mt-3 inline-flex text-sm font-semibold text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Go to Modules for your plan
          </a>
        </section>
      )}
    </section>
  );
}
