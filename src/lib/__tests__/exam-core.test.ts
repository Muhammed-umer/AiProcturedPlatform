import { describe, it, expect, vi } from "vitest";

// cleanAnswer and buildPaper are pure; the module only needs the database
// for loading and grading, which these tests do not touch.
vi.mock("@/db", () => ({ db: {} }));

const { cleanAnswer, buildPaper, MAX_TEXT_ANSWER } = await import("../exam-core");
type Content = Parameters<typeof cleanAnswer>[0];

const section = {
  id: "s1",
  testId: "t1",
  name: "Section A",
  topic: null,
  ordinal: 0,
  defaultMarks: "1",
  negativeMarks: "0",
};

function question(id: string, type: "mcq_single" | "mcq_multiple" | "fill_blank", ordinal: number) {
  return {
    id,
    sectionId: "s1",
    type,
    body: `Question ${id}`,
    ordinal,
    marksOverride: null,
    negativeOverride: null,
    acceptedAnswers: type === "fill_blank" ? ["paris"] : null,
    explanation: null,
  };
}

function option(id: string, questionId: string, isCorrect: boolean, ordinal: number) {
  return { id, questionId, body: `Option ${id}`, isCorrect, ordinal };
}

const questions = [
  question("single", "mcq_single", 0),
  question("multi", "mcq_multiple", 1),
  question("text", "fill_blank", 2),
];
const options = [
  option("a", "single", true, 0),
  option("b", "single", false, 1),
  option("c", "multi", true, 0),
  option("d", "multi", true, 1),
  option("e", "multi", false, 2),
];

const content: Content = {
  sections: [section],
  questions,
  options,
  optionIdsByQuestion: new Map([
    ["single", new Set(["a", "b"])],
    ["multi", new Set(["c", "d", "e"])],
  ]),
  questionById: new Map(questions.map((q) => [q.id, q])),
};

describe("cleanAnswer", () => {
  it("accepts a normal answer to each question type", () => {
    expect(cleanAnswer(content, "single", { selectedOptionIds: ["a"] })).toEqual({
      selectedOptionIds: ["a"],
      textAnswer: null,
    });
    expect(
      cleanAnswer(content, "multi", { selectedOptionIds: ["c", "d"] }),
    ).toEqual({ selectedOptionIds: ["c", "d"], textAnswer: null });
    expect(cleanAnswer(content, "text", { textAnswer: "Paris" })).toEqual({
      selectedOptionIds: null,
      textAnswer: "Paris",
    });
  });

  it("allows clearing an answer", () => {
    expect(cleanAnswer(content, "single", { selectedOptionIds: [] })).toEqual({
      selectedOptionIds: [],
      textAnswer: null,
    });
  });

  it("refuses a question that is not on this test", () => {
    expect(cleanAnswer(content, "other-test-q", { selectedOptionIds: ["a"] })).toBeNull();
    expect(cleanAnswer(content, 42, { selectedOptionIds: ["a"] })).toBeNull();
  });

  it("refuses an option belonging to another question", () => {
    expect(cleanAnswer(content, "single", { selectedOptionIds: ["c"] })).toBeNull();
  });

  it("refuses two picks on a one-answer question", () => {
    expect(
      cleanAnswer(content, "single", { selectedOptionIds: ["a", "b"] }),
    ).toBeNull();
  });

  it("collapses a repeated option instead of storing it twice", () => {
    expect(
      cleanAnswer(content, "multi", { selectedOptionIds: ["c", "c"] }),
    ).toEqual({ selectedOptionIds: ["c"], textAnswer: null });
  });

  it("refuses malformed values", () => {
    expect(cleanAnswer(content, "multi", { selectedOptionIds: "c" })).toBeNull();
    expect(cleanAnswer(content, "multi", { selectedOptionIds: [1] })).toBeNull();
    expect(cleanAnswer(content, "text", { textAnswer: 5 })).toBeNull();
    expect(cleanAnswer(content, "single", null)).toBeNull();
  });

  it("refuses text past the length limit", () => {
    expect(
      cleanAnswer(content, "text", { textAnswer: "x".repeat(MAX_TEXT_ANSWER + 1) }),
    ).toBeNull();
    expect(
      cleanAnswer(content, "text", { textAnswer: "x".repeat(MAX_TEXT_ANSWER) }),
    ).not.toBeNull();
  });
});

describe("buildPaper", () => {
  it("never sends which option is correct", () => {
    const paper = buildPaper(content, 7, { questions: true, options: true });
    for (const q of paper) {
      for (const o of q.options) expect(Object.keys(o).sort()).toEqual(["body", "id"]);
    }
  });

  it("is the same paper for the same seed, so a reload changes nothing", () => {
    const one = buildPaper(content, 7, { questions: true, options: true });
    const two = buildPaper(content, 7, { questions: true, options: true });
    expect(two).toEqual(one);
  });

  it("keeps the original order when shuffling is off", () => {
    const paper = buildPaper(content, 7, { questions: false, options: false });
    expect(paper.map((q) => q.id)).toEqual(["single", "multi", "text"]);
    expect(paper[1].options.map((o) => o.id)).toEqual(["c", "d", "e"]);
  });
});
