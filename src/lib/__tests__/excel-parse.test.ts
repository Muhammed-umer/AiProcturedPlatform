import { describe, it, expect } from "vitest";
import { parseStudentRows, parseQuestionRows } from "../excel-parse";

describe("parseStudentRows", () => {
  it("reads the standard columns", () => {
    const r = parseStudentRows([
      { "Roll Number": "21CS001", Name: "Aarav", Email: "a@college.edu" },
    ]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].rollNumber).toBe("21CS001");
    expect(r.valid[0].email).toBe("a@college.edu");
  });

  it("accepts common header spellings", () => {
    const r = parseStudentRows([
      { rollno: "21CS002", "Student Name": "Diya", mail: "d@college.edu" },
    ]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].name).toBe("Diya");
  });

  it("treats a missing email as optional", () => {
    const r = parseStudentRows([{ "Roll Number": "21CS003", Name: "Rohan" }]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].email).toBeNull();
  });

  it("reports a row with no roll number", () => {
    const r = parseStudentRows([{ Name: "Nobody" }]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/roll number/i);
  });

  it("reports a row with no name", () => {
    const r = parseStudentRows([{ "Roll Number": "21CS004" }]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/name/i);
  });

  it("rejects a malformed email", () => {
    const r = parseStudentRows([
      { "Roll Number": "21CS005", Name: "Test", Email: "not-an-email" },
    ]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/valid email/i);
  });

  it("keeps the first of a duplicated roll number and flags the rest", () => {
    const r = parseStudentRows([
      { "Roll Number": "21CS001", Name: "First" },
      { "Roll Number": "21CS001", Name: "Second" },
    ]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].name).toBe("First");
    expect(r.duplicates).toContain("21CS001");
  });

  it("skips blank rows silently", () => {
    const r = parseStudentRows([
      { "Roll Number": "", Name: "", Email: "" },
      { "Roll Number": "21CS006", Name: "Real" },
    ]);
    expect(r.valid).toHaveLength(1);
    expect(r.issues).toHaveLength(0);
  });

  it("numbers issues by spreadsheet row, counting the header", () => {
    const r = parseStudentRows([
      { "Roll Number": "21CS001", Name: "Fine" },
      { "Roll Number": "", Name: "Broken" },
    ]);
    expect(r.issues[0].row).toBe(3);
  });
});

describe("parseQuestionRows", () => {
  const mcq = {
    Section: "Section A",
    Type: "MCQ",
    Question: "Capital of France?",
    "Option A": "Paris",
    "Option B": "Rome",
    "Option C": "Madrid",
    "Option D": "Berlin",
    Correct: "A",
    Marks: "1",
  };

  it("reads a single answer question", () => {
    const r = parseQuestionRows([mcq]);
    expect(r.valid).toHaveLength(1);

    const q = r.valid[0];
    expect(q.type).toBe("mcq_single");
    expect(q.options).toHaveLength(4);
    expect(q.options[0].isCorrect).toBe(true);
    expect(q.options[1].isCorrect).toBe(false);
    expect(q.marks).toBe(1);
  });

  it("reads a several answer question", () => {
    const r = parseQuestionRows([
      { ...mcq, Type: "Multiple", Correct: "A,C" },
    ]);
    const q = r.valid[0];
    expect(q.type).toBe("mcq_multiple");
    expect(q.options.filter((o) => o.isCorrect)).toHaveLength(2);
  });

  it("reads a fill in the blank with alternative spellings", () => {
    const r = parseQuestionRows([
      {
        Section: "Section B",
        Type: "Fill",
        Question: "Symbol for water?",
        Correct: "H2O|water",
      },
    ]);
    const q = r.valid[0];
    expect(q.type).toBe("fill_blank");
    expect(q.acceptedAnswers).toEqual(["H2O", "water"]);
    expect(q.options).toHaveLength(0);
  });

  it("defaults the section when none is given", () => {
    const { Section, ...rest } = mcq;
    void Section;
    const r = parseQuestionRows([rest]);
    expect(r.valid[0].section).toBe("Section A");
  });

  it("leaves marks null so the section default applies", () => {
    const { Marks, ...rest } = mcq;
    void Marks;
    const r = parseQuestionRows([rest]);
    expect(r.valid[0].marks).toBeNull();
  });

  it("rejects an unknown question type", () => {
    const r = parseQuestionRows([{ ...mcq, Type: "essay" }]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/not a known question type/i);
  });

  it("rejects a correct letter with no matching option", () => {
    const r = parseQuestionRows([{ ...mcq, Correct: "F" }]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/does not match any option/i);
  });

  it("rejects a single answer question with two correct options", () => {
    const r = parseQuestionRows([{ ...mcq, Correct: "A,B" }]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/exactly one correct option/i);
  });

  it("rejects a several answer question with only one correct option", () => {
    const r = parseQuestionRows([{ ...mcq, Type: "Multiple", Correct: "A" }]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/at least two correct/i);
  });

  it("rejects a choice question with fewer than two options", () => {
    const r = parseQuestionRows([
      {
        Section: "A",
        Type: "MCQ",
        Question: "Only one option?",
        "Option A": "Yes",
        Correct: "A",
      },
    ]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/at least two options/i);
  });

  it("rejects a missing correct answer", () => {
    const r = parseQuestionRows([{ ...mcq, Correct: "" }]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/correct answer is missing/i);
  });

  it("rejects a non-numeric mark", () => {
    const r = parseQuestionRows([{ ...mcq, Marks: "two" }]);
    expect(r.valid).toHaveLength(0);
    expect(r.issues[0].message).toMatch(/not a valid mark/i);
  });

  it("keeps good rows and reports only the bad ones", () => {
    const r = parseQuestionRows([mcq, { ...mcq, Correct: "Z" }, mcq]);
    expect(r.valid).toHaveLength(2);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].row).toBe(3);
  });
});
