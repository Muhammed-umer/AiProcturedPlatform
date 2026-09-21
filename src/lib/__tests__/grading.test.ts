import { describe, it, expect } from "vitest";
import {
  gradeQuestion,
  gradeAttempt,
  resolveMarks,
  resolveNegative,
  normalizeText,
  type GradableQuestion,
} from "../grading";

const single: GradableQuestion = {
  id: "q1",
  type: "mcq_single",
  sectionMarks: 1,
  sectionNegative: 0,
  options: [
    { id: "a", isCorrect: false },
    { id: "b", isCorrect: true },
    { id: "c", isCorrect: false },
  ],
};

const multiple: GradableQuestion = {
  id: "q2",
  type: "mcq_multiple",
  sectionMarks: 2,
  sectionNegative: 0,
  options: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: false },
    { id: "c", isCorrect: true },
    { id: "d", isCorrect: false },
  ],
};

const blank: GradableQuestion = {
  id: "q3",
  type: "fill_blank",
  sectionMarks: 1,
  sectionNegative: 0,
  acceptedAnswers: ["H2O", "water"],
};

describe("resolveMarks", () => {
  it("uses the section default when no override is set", () => {
    expect(resolveMarks(single)).toBe(1);
  });

  it("prefers a per-question override", () => {
    expect(resolveMarks({ ...single, marksOverride: 5 })).toBe(5);
  });

  it("treats null as no override rather than zero", () => {
    expect(resolveMarks({ ...single, marksOverride: null })).toBe(1);
  });

  it("honours an override of zero", () => {
    expect(resolveMarks({ ...single, marksOverride: 0 })).toBe(0);
  });

  it("resolves negative marks the same way", () => {
    expect(resolveNegative({ ...single, sectionNegative: 0.5 })).toBe(0.5);
    expect(
      resolveNegative({ ...single, sectionNegative: 0.5, negativeOverride: 1 }),
    ).toBe(1);
  });
});

describe("normalizeText", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeText("  New   DELHI ")).toBe("new delhi");
  });
});

describe("gradeQuestion, single answer", () => {
  it("awards full marks for the correct option", () => {
    const r = gradeQuestion(single, { questionId: "q1", selectedOptionIds: ["b"] });
    expect(r.isCorrect).toBe(true);
    expect(r.awardedMarks).toBe(1);
  });

  it("awards nothing for a wrong option", () => {
    const r = gradeQuestion(single, { questionId: "q1", selectedOptionIds: ["a"] });
    expect(r.isCorrect).toBe(false);
    expect(r.awardedMarks).toBe(0);
  });

  it("applies negative marking to a wrong answer", () => {
    const q = { ...single, sectionNegative: 0.25 };
    const r = gradeQuestion(q, { questionId: "q1", selectedOptionIds: ["a"] });
    expect(r.awardedMarks).toBe(-0.25);
  });

  it("never penalises an unanswered question", () => {
    const q = { ...single, sectionNegative: 0.25 };
    const r = gradeQuestion(q, undefined);
    expect(r.attempted).toBe(false);
    expect(r.awardedMarks).toBe(0);
  });

  it("rejects selecting more than one option", () => {
    const r = gradeQuestion(single, {
      questionId: "q1",
      selectedOptionIds: ["a", "b"],
    });
    expect(r.isCorrect).toBe(false);
  });
});

describe("gradeQuestion, several answers", () => {
  it("awards marks only when every correct option is chosen", () => {
    const r = gradeQuestion(multiple, {
      questionId: "q2",
      selectedOptionIds: ["a", "c"],
    });
    expect(r.isCorrect).toBe(true);
    expect(r.awardedMarks).toBe(2);
  });

  it("ignores the order options were selected in", () => {
    const r = gradeQuestion(multiple, {
      questionId: "q2",
      selectedOptionIds: ["c", "a"],
    });
    expect(r.isCorrect).toBe(true);
  });

  it("gives nothing for a partially correct selection", () => {
    const r = gradeQuestion(multiple, {
      questionId: "q2",
      selectedOptionIds: ["a"],
    });
    expect(r.isCorrect).toBe(false);
    expect(r.awardedMarks).toBe(0);
  });

  it("gives nothing when a wrong option is included as well", () => {
    const r = gradeQuestion(multiple, {
      questionId: "q2",
      selectedOptionIds: ["a", "b", "c"],
    });
    expect(r.isCorrect).toBe(false);
  });
});

describe("gradeQuestion, fill in the blank", () => {
  it("accepts any listed spelling", () => {
    expect(
      gradeQuestion(blank, { questionId: "q3", textAnswer: "water" }).isCorrect,
    ).toBe(true);
    expect(
      gradeQuestion(blank, { questionId: "q3", textAnswer: "H2O" }).isCorrect,
    ).toBe(true);
  });

  it("ignores capitals and surrounding spaces", () => {
    expect(
      gradeQuestion(blank, { questionId: "q3", textAnswer: "  WaTeR  " })
        .isCorrect,
    ).toBe(true);
  });

  it("rejects a wrong answer", () => {
    expect(
      gradeQuestion(blank, { questionId: "q3", textAnswer: "oxygen" }).isCorrect,
    ).toBe(false);
  });

  it("counts whitespace only as unattempted", () => {
    const r = gradeQuestion(blank, { questionId: "q3", textAnswer: "   " });
    expect(r.attempted).toBe(false);
  });
});

describe("gradeAttempt", () => {
  it("totals marks and counts outcomes across question types", () => {
    const result = gradeAttempt(
      [single, multiple, blank],
      [
        { questionId: "q1", selectedOptionIds: ["b"] },
        { questionId: "q2", selectedOptionIds: ["a"] },
        { questionId: "q3", textAnswer: "water" },
      ],
    );

    expect(result.totalScore).toBe(2); // 1 + 0 + 1
    expect(result.maxScore).toBe(4); // 1 + 2 + 1
    expect(result.correctCount).toBe(2);
    expect(result.wrongCount).toBe(1);
    expect(result.unattemptedCount).toBe(0);
  });

  it("counts questions with no submitted answer as unattempted", () => {
    const result = gradeAttempt([single, multiple, blank], []);
    expect(result.unattemptedCount).toBe(3);
    expect(result.totalScore).toBe(0);
  });

  it("never returns a negative total", () => {
    const harsh: GradableQuestion = {
      ...single,
      sectionMarks: 1,
      sectionNegative: 5,
    };
    const result = gradeAttempt(
      [harsh],
      [{ questionId: "q1", selectedOptionIds: ["a"] }],
    );
    expect(result.totalScore).toBe(0);
  });

  it("respects a per-question mark override in the total", () => {
    const result = gradeAttempt(
      [{ ...single, marksOverride: 4 }],
      [{ questionId: "q1", selectedOptionIds: ["b"] }],
    );
    expect(result.totalScore).toBe(4);
    expect(result.maxScore).toBe(4);
  });
});
