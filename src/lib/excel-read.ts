import ExcelJS from "exceljs";
import type { RawRow } from "./excel-parse";

/**
 * Turns the first worksheet of an uploaded workbook into plain row objects
 * keyed by the header text, which the pure parsers in `excel-parse.ts` consume.
 *
 * Kept separate so the parsing rules stay unit testable without a real file.
 */
export async function readSheetRows(buffer: ArrayBuffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no sheets");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];

  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? "").trim();
  });

  const rows: RawRow[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const obj: RawRow = {};
    let hasValue = false;

    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = headers[col];
      if (!key) return;

      let value = cell.value;

      // Formula cells expose their computed result separately.
      if (value && typeof value === "object" && "result" in value) {
        value = (value as { result?: unknown }).result as never;
      }
      // Hyperlinked email cells arrive as rich text objects.
      if (value && typeof value === "object" && "text" in value) {
        value = (value as { text?: unknown }).text as never;
      }

      const text = value === null || value === undefined ? "" : String(value).trim();
      if (text !== "") hasValue = true;
      obj[key] = text;
    });

    if (hasValue) rows.push(obj);
  });

  return rows;
}

/** Builds the downloadable student import template. */
export async function buildStudentTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Students");

  sheet.columns = [
    { header: "Roll Number", key: "roll", width: 18 },
    { header: "Name", key: "name", width: 28 },
    { header: "Email", key: "email", width: 32 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.addRow(["21CS001", "Example Student", "student@college.edu"]);
  sheet.addRow(["21CS002", "Another Student", ""]);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** Builds the downloadable question import template. */
export async function buildQuestionTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Questions");

  sheet.columns = [
    { header: "Section", key: "section", width: 16 },
    { header: "Type", key: "type", width: 12 },
    { header: "Question", key: "question", width: 48 },
    { header: "Option A", key: "a", width: 20 },
    { header: "Option B", key: "b", width: 20 },
    { header: "Option C", key: "c", width: 20 },
    { header: "Option D", key: "d", width: 20 },
    { header: "Correct", key: "correct", width: 14 },
    { header: "Marks", key: "marks", width: 8 },
  ];

  sheet.getRow(1).font = { bold: true };

  sheet.addRow([
    "Section A",
    "MCQ",
    "What is the capital of France?",
    "Paris",
    "Rome",
    "Madrid",
    "Berlin",
    "A",
    1,
  ]);
  sheet.addRow([
    "Section A",
    "Multiple",
    "Which of these are prime numbers?",
    "2",
    "4",
    "7",
    "9",
    "A,C",
    2,
  ]);
  sheet.addRow([
    "Section B",
    "Fill",
    "The chemical symbol for water is ______",
    "",
    "",
    "",
    "",
    "H2O|water",
    1,
  ]);

  const notes = wb.addWorksheet("How to fill this in");
  notes.columns = [
    { header: "Column", key: "col", width: 16 },
    { header: "What to enter", key: "desc", width: 78 },
  ];
  notes.getRow(1).font = { bold: true };
  [
    ["Section", "Any name. Sections not already in the test are created automatically."],
    ["Type", "MCQ for one answer, Multiple for several answers, Fill for a typed answer."],
    ["Question", "The question text. Required."],
    ["Option A to D", "Choice text. Leave blank for a Fill question."],
    ["Correct", "Option letter such as A, or A,C for several. For Fill, the accepted text, separated by | for alternatives."],
    ["Marks", "Optional. Leave blank to use the section default."],
  ].forEach((r) => notes.addRow(r));

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
