import { describe, it, expect } from "vitest";
import {
  rankScores,
  summarize,
  sectionAverages,
  questionStats,
  percentage,
  type ScoreRow,
} from "../analytics";

const rows: ScoreRow[] = [
  { userId: "u1", rollNumber: "21CS001", name: "Aarav", totalScore: 8, maxScore: 10 },
  { userId: "u2", rollNumber: "21CS002", name: "Diya", totalScore: 10, maxScore: 10 },
  { userId: "u3", rollNumber: "21CS003", name: "Rohan", totalScore: 4, maxScore: 10 },
];

describe("percentage", () => {
  it("computes a rounded percentage", () => {
    expect(percentage(8, 10)).toBe(80);
    expect(percentage(1, 3)).toBe(33.33);
  });

  it("returns zero rather than dividing by zero", () => {
    expect(percentage(5, 0)).toBe(0);
  });
});

describe("rankScores", () => {
  it("puts the highest score first", () => {
    const ranked = rankScores(rows);
    expect(ranked[0].name).toBe("Diya");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[2].name).toBe("Rohan");
    expect(ranked[2].rank).toBe(3);
  });

  it("gives tied scores the same rank and skips the next", () => {
    const tied: ScoreRow[] = [
      { userId: "a", rollNumber: "A1", name: "A", totalScore: 9, maxScore: 10 },
      { userId: "b", rollNumber: "B1", name: "B", totalScore: 9, maxScore: 10 },
      { userId: "c", rollNumber: "C1", name: "C", totalScore: 5, maxScore: 10 },
    ];
    const ranked = rankScores(tied);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });

  it("does not modify the array it was given", () => {
    const copy = [...rows];
    rankScores(rows);
    expect(rows).toEqual(copy);
  });

  it("returns an empty list unchanged", () => {
    expect(rankScores([])).toEqual([]);
  });
});

describe("summarize", () => {
  it("reports average, highest, lowest and both performers", () => {
    const s = summarize(rows);
    expect(s.attempted).toBe(3);
    expect(s.average).toBe(7.33);
    expect(s.highest).toBe(10);
    expect(s.lowest).toBe(4);
    expect(s.topPerformer?.name).toBe("Diya");
    expect(s.lowestPerformer?.name).toBe("Rohan");
  });

  it("counts passes against the default 40 percent", () => {
    const s = summarize(rows);
    expect(s.passCount).toBe(3);
    expect(s.passPercentage).toBe(100);
  });

  it("honours a custom pass mark", () => {
    const s = summarize(rows, 85);
    expect(s.passCount).toBe(1);
  });

  it("handles no submissions without crashing", () => {
    const s = summarize([]);
    expect(s.attempted).toBe(0);
    expect(s.average).toBe(0);
    expect(s.topPerformer).toBeNull();
  });
});

describe("sectionAverages", () => {
  it("averages each section across students", () => {
    const result = sectionAverages([
      { sectionId: "s1", sectionName: "A", topic: "Quant", score: 8, maxScore: 10 },
      { sectionId: "s1", sectionName: "A", topic: "Quant", score: 6, maxScore: 10 },
      { sectionId: "s2", sectionName: "B", topic: "GK", score: 2, maxScore: 10 },
      { sectionId: "s2", sectionName: "B", topic: "GK", score: 4, maxScore: 10 },
    ]);

    const quant = result.find((r) => r.sectionId === "s1")!;
    const gk = result.find((r) => r.sectionId === "s2")!;

    expect(quant.averageScore).toBe(7);
    expect(quant.averagePercentage).toBe(70);
    expect(quant.studentCount).toBe(2);

    // This is the signal faculty actually act on.
    expect(gk.averagePercentage).toBe(30);
    expect(gk.averagePercentage).toBeLessThan(quant.averagePercentage);
  });

  it("returns nothing for no input", () => {
    expect(sectionAverages([])).toEqual([]);
  });
});

describe("questionStats", () => {
  it("counts how many students answered each question correctly", () => {
    const stats = questionStats([
      { questionId: "q1", isCorrect: true, attempted: true },
      { questionId: "q1", isCorrect: true, attempted: true },
      { questionId: "q1", isCorrect: false, attempted: true },
      { questionId: "q2", isCorrect: false, attempted: false },
      { questionId: "q2", isCorrect: false, attempted: true },
    ]);

    const q1 = stats.find((s) => s.questionId === "q1")!;
    expect(q1.correctCount).toBe(2);
    expect(q1.totalResponses).toBe(3);
    expect(q1.correctPercentage).toBe(66.67);

    const q2 = stats.find((s) => s.questionId === "q2")!;
    expect(q2.correctCount).toBe(0);
    expect(q2.attemptedCount).toBe(1);
    expect(q2.correctPercentage).toBe(0);
  });
});
