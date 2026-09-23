/**
 * Pure grading logic. No database and no framework imports, so this can be
 * unit tested directly and reused by both the submit route and the analytics.
 */

import type { QuestionType } from "@/db/schema";

export interface GradableOption {
  id: string;
  isCorrect: boolean;
}

export interface GradableQuestion {
  id: string;
  type: QuestionType;
  /** Section default, used when the question carries no override. */
  sectionMarks: number;
  sectionNegative: number;
  marksOverride?: number | null;
  negativeOverride?: number | null;
  options?: GradableOption[];
  /** Every spelling accepted for a fill in the blank question. */
  acceptedAnswers?: string[] | null;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedOptionIds?: string[] | null;
  textAnswer?: string | null;
}

export interface GradedAnswer {
  questionId: string;
  isCorrect: boolean;
  attempted: boolean;
  awardedMarks: number;
  maxMarks: number;
}

export interface GradedResult {
  answers: GradedAnswer[];
  totalScore: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
}

/** Marks for a question, preferring its own override over the section value. */
export function resolveMarks(q: GradableQuestion): number {
  const v = q.marksOverride;
  return v === null || v === undefined ? q.sectionMarks : v;
}

/** Negative marks for a question, preferring its own override. */
export function resolveNegative(q: GradableQuestion): number {
  const v = q.negativeOverride;
  return v === null || v === undefined ? q.sectionNegative : v;
}

/** Trims, lowercases and collapses runs of whitespace. */
export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function correctOptionIds(q: GradableQuestion): string[] {
  return (q.options ?? []).filter((o) => o.isCorrect).map((o) => o.id);
}

/**
 * True when both sides contain exactly the same ids, order ignored.
 * Compared as sets, so a hand-crafted answer that repeats one correct id
 * ["A", "A"] cannot pass for the full answer ["A", "B"].
 */
function sameIdSet(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const id of setA) if (!setB.has(id)) return false;
  return true;
}

/**
 * Grades one question.
 *
 * Multiple-answer questions are all or nothing. Selecting three of four
 * correct options scores zero, which is the convention students expect from
 * placement tests and avoids arguments about partial credit.
 */
export function gradeQuestion(
  q: GradableQuestion,
  answer: SubmittedAnswer | undefined,
): GradedAnswer {
  const maxMarks = resolveMarks(q);
  const negative = resolveNegative(q);

  const selected = answer?.selectedOptionIds ?? [];
  const typed = answer?.textAnswer ?? "";

  const attempted =
    q.type === "fill_blank" ? typed.trim().length > 0 : selected.length > 0;

  if (!attempted) {
    return {
      questionId: q.id,
      isCorrect: false,
      attempted: false,
      awardedMarks: 0,
      maxMarks,
    };
  }

  let isCorrect = false;

  if (q.type === "fill_blank") {
    const accepted = (q.acceptedAnswers ?? []).map(normalizeText);
    isCorrect = accepted.includes(normalizeText(typed));
  } else if (q.type === "mcq_single") {
    const correct = correctOptionIds(q);
    isCorrect = selected.length === 1 && correct.includes(selected[0]);
  } else {
    isCorrect = sameIdSet(selected, correctOptionIds(q));
  }

  // `-negative` would produce -0 when there is no negative marking, which
  // reads oddly in the database and in exports.
  const penalty = negative === 0 ? 0 : -negative;

  return {
    questionId: q.id,
    isCorrect,
    attempted: true,
    awardedMarks: isCorrect ? maxMarks : penalty,
    maxMarks,
  };
}

/** Grades a whole attempt. Unanswered questions never attract a penalty. */
export function gradeAttempt(
  questions: GradableQuestion[],
  submitted: SubmittedAnswer[],
): GradedResult {
  const byQuestion = new Map(submitted.map((a) => [a.questionId, a]));

  const answers = questions.map((q) => gradeQuestion(q, byQuestion.get(q.id)));

  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;

  for (const a of answers) {
    totalScore += a.awardedMarks;
    maxScore += a.maxMarks;
    if (!a.attempted) unattemptedCount++;
    else if (a.isCorrect) correctCount++;
    else wrongCount++;
  }

  // A run of negative marks must never produce a score below zero.
  totalScore = Math.max(0, Math.round(totalScore * 100) / 100);
  maxScore = Math.round(maxScore * 100) / 100;

  return {
    answers,
    totalScore,
    maxScore,
    correctCount,
    wrongCount,
    unattemptedCount,
  };
}
