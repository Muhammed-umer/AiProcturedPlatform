/**
 * Row-level parsing and validation for the two spreadsheet uploads.
 *
 * The functions here take plain objects rather than a workbook, so they are
 * pure and unit testable. Reading the actual .xlsx file into these rows is
 * done separately in `excel-read.ts`, which needs the filesystem.
 */

import type { QuestionType } from "@/db/schema";

export interface RawRow {
  [key: string]: string | number | null | undefined;
}

export interface RowIssue {
  row: number;
  message: string;
}

/* ------------------------------------------------------- student list ---- */

export interface StudentRow {
  rollNumber: string;
  name: string;
  email: string | null;
}

export interface StudentParseResult {
  valid: StudentRow[];
  issues: RowIssue[];
  duplicates: string[];
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Finds a column by any of several accepted header spellings. */
function pick(row: RawRow, keys: string[]): string {
  const lowered: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    lowered[k.trim().toLowerCase().replace(/[\s_]+/g, "")] = row[k];
  }
  for (const key of keys) {
    const norm = key.toLowerCase().replace(/[\s_]+/g, "");
    if (lowered[norm] !== undefined && str(lowered[norm]) !== "") {
      return str(lowered[norm]);
    }
  }
  return "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Expected headers: Roll Number, Name, Email.
 * Common variants such as "rollno" or "student name" are accepted.
 */
export function parseStudentRows(rows: RawRow[]): StudentParseResult {
  const valid: StudentRow[] = [];
  const issues: RowIssue[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  rows.forEach((raw, index) => {
    // Row 1 is the header, so data starts at spreadsheet row 2.
    const rowNumber = index + 2;

    const rollNumber = pick(raw, ["rollnumber", "rollno", "roll", "registerno"]);
    const name = pick(raw, ["name", "studentname", "fullname"]);
    const email = pick(raw, ["email", "emailid", "mail"]);

    if (!rollNumber && !name && !email) return; // silently skip blank rows

    if (!rollNumber) {
      issues.push({ row: rowNumber, message: "Roll number is missing" });
      return;
    }
    if (!name) {
      issues.push({ row: rowNumber, message: "Name is missing" });
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      issues.push({ row: rowNumber, message: `"${email}" is not a valid email` });
      return;
    }

    const key = rollNumber.toUpperCase();
    if (seen.has(key)) {
      duplicates.push(rollNumber);
      issues.push({
        row: rowNumber,
        message: `Roll number ${rollNumber} appears more than once in this file`,
      });
      return;
    }
    seen.add(key);

    valid.push({ rollNumber, name, email: email || null });
  });

  return { valid, issues, duplicates };
}

/* ---------------------------------------------------------- questions ---- */

export interface ParsedOption {
  body: string;
  isCorrect: boolean;
}

export interface QuestionRow {
  section: string;
  type: QuestionType;
  body: string;
  options: ParsedOption[];
  acceptedAnswers: string[] | null;
  marks: number | null;
}

export interface QuestionParseResult {
  valid: QuestionRow[];
  issues: RowIssue[];
}

const OPTION_KEYS = ["a", "b", "c", "d", "e", "f"];

function normalizeType(value: string): QuestionType | null {
  const v = value.toLowerCase().replace(/[\s_-]+/g, "");
  if (["mcq", "mcqsingle", "single", "singlechoice", "radio"].includes(v)) {
    return "mcq_single";
  }
  if (
    ["mcqmultiple", "multiple", "multi", "multiplechoice", "checkbox"].includes(v)
  ) {
    return "mcq_multiple";
  }
  if (["fill", "fillblank", "fillintheblank", "text", "blank"].includes(v)) {
    return "fill_blank";
  }
  return null;
}

/**
 * Expected headers: Section, Type, Question, Option A..F, Correct, Marks.
 *
 * `Correct` holds option letters for the MCQ types ("A" or "A,C") and the
 * accepted text for a fill in the blank, where several spellings can be
 * separated by a pipe.
 */
export function parseQuestionRows(rows: RawRow[]): QuestionParseResult {
  const valid: QuestionRow[] = [];
  const issues: RowIssue[] = [];

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;

    const body = pick(raw, ["question", "questiontext", "body"]);
    if (!body) {
      const anything = Object.values(raw).some((v) => str(v) !== "");
      if (anything) {
        issues.push({ row: rowNumber, message: "Question text is missing" });
      }
      return;
    }

    const section = pick(raw, ["section", "sectionname"]) || "Section A";
    const typeRaw = pick(raw, ["type", "questiontype"]) || "mcq";
    const type = normalizeType(typeRaw);

    if (!type) {
      issues.push({
        row: rowNumber,
        message: `"${typeRaw}" is not a known question type. Use MCQ, Multiple or Fill`,
      });
      return;
    }

    const correctRaw = pick(raw, ["correct", "answer", "correctanswer"]);
    if (!correctRaw) {
      issues.push({ row: rowNumber, message: "Correct answer is missing" });
      return;
    }

    const marksRaw = pick(raw, ["marks", "mark", "score"]);
    const marksNum = marksRaw === "" ? null : Number(marksRaw);
    if (marksRaw !== "" && (Number.isNaN(marksNum) || marksNum! <= 0)) {
      issues.push({ row: rowNumber, message: `"${marksRaw}" is not a valid mark` });
      return;
    }

    if (type === "fill_blank") {
      const accepted = correctRaw
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      if (accepted.length === 0) {
        issues.push({ row: rowNumber, message: "No accepted answer given" });
        return;
      }
      valid.push({
        section,
        type,
        body,
        options: [],
        acceptedAnswers: accepted,
        marks: marksNum,
      });
      return;
    }

    const optionBodies: { letter: string; body: string }[] = [];
    for (const letter of OPTION_KEYS) {
      const text = pick(raw, [`option${letter}`, `opt${letter}`, letter]);
      if (text) optionBodies.push({ letter, body: text });
    }

    if (optionBodies.length < 2) {
      issues.push({
        row: rowNumber,
        message: "At least two options are needed for a choice question",
      });
      return;
    }

    const correctLetters = correctRaw
      .split(/[,;/\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const unknown = correctLetters.filter(
      (l) => !optionBodies.some((o) => o.letter === l),
    );
    if (unknown.length > 0) {
      issues.push({
        row: rowNumber,
        message: `Correct answer "${unknown.join(", ")}" does not match any option`,
      });
      return;
    }

    if (type === "mcq_single" && correctLetters.length !== 1) {
      issues.push({
        row: rowNumber,
        message: "A single answer question must have exactly one correct option",
      });
      return;
    }
    if (type === "mcq_multiple" && correctLetters.length < 2) {
      issues.push({
        row: rowNumber,
        message: "A multiple answer question needs at least two correct options",
      });
      return;
    }

    valid.push({
      section,
      type,
      body,
      options: optionBodies.map((o) => ({
        body: o.body,
        isCorrect: correctLetters.includes(o.letter),
      })),
      acceptedAnswers: null,
      marks: marksNum,
    });
  });

  return { valid, issues };
}
