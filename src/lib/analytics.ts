/**
 * Pure analytics helpers. Rankings, section averages and per-question
 * difficulty, all computed from plain arrays so they can be unit tested.
 */

export interface ScoreRow {
  userId: string;
  rollNumber: string;
  name: string;
  totalScore: number;
  maxScore: number;
}

export interface RankedRow extends ScoreRow {
  rank: number;
  percentage: number;
}

export interface TestSummary {
  attempted: number;
  average: number;
  highest: number;
  lowest: number;
  passCount: number;
  passPercentage: number;
  topPerformer: RankedRow | null;
  lowestPerformer: RankedRow | null;
  ranked: RankedRow[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function percentage(score: number, max: number): number {
  if (max <= 0) return 0;
  return round2((score / max) * 100);
}

/**
 * Ranks highest score first. Equal scores share a rank, and the next distinct
 * score skips ahead, so two students tied at rank 1 are followed by rank 3.
 */
export function rankScores(rows: ScoreRow[]): RankedRow[] {
  const sorted = rows
    .slice()
    .sort(
      (a, b) =>
        b.totalScore - a.totalScore || a.rollNumber.localeCompare(b.rollNumber),
    );

  let lastScore: number | null = null;
  let lastRank = 0;

  return sorted.map((row, index) => {
    const rank = lastScore === row.totalScore ? lastRank : index + 1;
    lastScore = row.totalScore;
    lastRank = rank;
    return { ...row, rank, percentage: percentage(row.totalScore, row.maxScore) };
  });
}

/** `passMarkPercent` defaults to the usual 40 percent. */
export function summarize(rows: ScoreRow[], passMarkPercent = 40): TestSummary {
  const ranked = rankScores(rows);

  if (ranked.length === 0) {
    return {
      attempted: 0,
      average: 0,
      highest: 0,
      lowest: 0,
      passCount: 0,
      passPercentage: 0,
      topPerformer: null,
      lowestPerformer: null,
      ranked: [],
    };
  }

  const scores = ranked.map((r) => r.totalScore);
  const passCount = ranked.filter(
    (r) => r.percentage >= passMarkPercent,
  ).length;

  return {
    attempted: ranked.length,
    average: round2(scores.reduce((a, b) => a + b, 0) / scores.length),
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    passCount,
    passPercentage: round2((passCount / ranked.length) * 100),
    topPerformer: ranked[0],
    lowestPerformer: ranked[ranked.length - 1],
    ranked,
  };
}

export interface SectionScoreRow {
  sectionId: string;
  sectionName: string;
  topic: string | null;
  score: number;
  maxScore: number;
}

export interface SectionAverage {
  sectionId: string;
  sectionName: string;
  topic: string | null;
  averageScore: number;
  maxScore: number;
  averagePercentage: number;
  studentCount: number;
}

/**
 * Average performance per section across every student. This is the
 * topic-wise view: it shows the class did well in Section A and poorly in
 * Section B.
 */
export function sectionAverages(rows: SectionScoreRow[]): SectionAverage[] {
  const buckets = new Map<string, SectionScoreRow[]>();

  for (const row of rows) {
    const list = buckets.get(row.sectionId);
    if (list) list.push(row);
    else buckets.set(row.sectionId, [row]);
  }

  return Array.from(buckets.values()).map((list) => {
    const first = list[0];
    const avgScore = list.reduce((a, r) => a + r.score, 0) / list.length;
    const max = first.maxScore;
    return {
      sectionId: first.sectionId,
      sectionName: first.sectionName,
      topic: first.topic,
      averageScore: round2(avgScore),
      maxScore: max,
      averagePercentage: percentage(avgScore, max),
      studentCount: list.length,
    };
  });
}

export interface QuestionOutcome {
  questionId: string;
  isCorrect: boolean;
  attempted: boolean;
}

export interface QuestionStat {
  questionId: string;
  correctCount: number;
  attemptedCount: number;
  totalResponses: number;
  /** Share of all students who got it right, the usual difficulty index. */
  correctPercentage: number;
}

/** A question almost nobody gets right is usually a badly worded question. */
export function questionStats(rows: QuestionOutcome[]): QuestionStat[] {
  const buckets = new Map<string, QuestionOutcome[]>();

  for (const row of rows) {
    const list = buckets.get(row.questionId);
    if (list) list.push(row);
    else buckets.set(row.questionId, [row]);
  }

  return Array.from(buckets.entries()).map(([questionId, list]) => {
    const correctCount = list.filter((r) => r.isCorrect).length;
    return {
      questionId,
      correctCount,
      attemptedCount: list.filter((r) => r.attempted).length,
      totalResponses: list.length,
      correctPercentage: percentage(correctCount, list.length),
    };
  });
}
