import { describe, it, expect } from "vitest";
import {
  bestAttemptPerStudent,
  attemptsLeft,
  clampMaxAttempts,
} from "../attempts";

describe("bestAttemptPerStudent", () => {
  it("keeps a single attempt as it is", () => {
    const rows = [{ userId: "a", attemptNumber: 1, totalScore: "4" }];
    expect(bestAttemptPerStudent(rows)).toEqual(rows);
  });

  it("picks the highest score for each student", () => {
    const rows = [
      { userId: "a", attemptNumber: 1, totalScore: "4" },
      { userId: "a", attemptNumber: 2, totalScore: "7" },
      { userId: "a", attemptNumber: 3, totalScore: "5" },
      { userId: "b", attemptNumber: 1, totalScore: "9" },
    ];
    const best = bestAttemptPerStudent(rows);
    expect(best).toHaveLength(2);
    expect(best.find((r) => r.userId === "a")?.attemptNumber).toBe(2);
    expect(best.find((r) => r.userId === "b")?.attemptNumber).toBe(1);
  });

  it("prefers the earlier attempt on a tie", () => {
    const best = bestAttemptPerStudent([
      { userId: "a", attemptNumber: 2, totalScore: 6 },
      { userId: "a", attemptNumber: 1, totalScore: 6 },
    ]);
    expect(best[0].attemptNumber).toBe(1);
  });

  it("treats a missing score as zero", () => {
    const best = bestAttemptPerStudent([
      { userId: "a", attemptNumber: 1, totalScore: null },
      { userId: "a", attemptNumber: 2, totalScore: "1" },
    ]);
    expect(best[0].attemptNumber).toBe(2);
  });
});

describe("attemptsLeft", () => {
  it("counts down and never goes negative", () => {
    expect(attemptsLeft(3, 0)).toBe(3);
    expect(attemptsLeft(3, 2)).toBe(1);
    expect(attemptsLeft(3, 3)).toBe(0);
    expect(attemptsLeft(3, 5)).toBe(0);
  });

  it("treats a limit below one as one", () => {
    expect(attemptsLeft(0, 0)).toBe(1);
  });
});

describe("clampMaxAttempts", () => {
  it("accepts whole numbers in range", () => {
    expect(clampMaxAttempts("3")).toBe(3);
    expect(clampMaxAttempts(1)).toBe(1);
  });

  it("clamps and rounds bad input", () => {
    expect(clampMaxAttempts("0")).toBe(1);
    expect(clampMaxAttempts("-2")).toBe(1);
    expect(clampMaxAttempts("abc")).toBe(1);
    expect(clampMaxAttempts("2.9")).toBe(2);
    expect(clampMaxAttempts("99")).toBe(10);
  });
});
