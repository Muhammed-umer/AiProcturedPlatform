/**
 * Rules for tests a student may sit more than once. Pure, so the results page,
 * the Excel export and the student dashboard all agree, and it can be tested
 * without a database.
 */

export interface AttemptLike {
  userId: string;
  attemptNumber: number;
  totalScore: number | string | null;
}

/**
 * The attempt that counts for each student: their highest score, and on a tie
 * the earlier attempt, so a student gains nothing by resitting only to match
 * a score they already had.
 */
export function bestAttemptPerStudent<T extends AttemptLike>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const current = best.get(row.userId);
    if (!current) {
      best.set(row.userId, row);
      continue;
    }
    const score = Number(row.totalScore ?? 0);
    const held = Number(current.totalScore ?? 0);
    if (
      score > held ||
      (score === held && row.attemptNumber < current.attemptNumber)
    ) {
      best.set(row.userId, row);
    }
  }
  return [...best.values()];
}

/** How many more times the student may start this test. Never negative. */
export function attemptsLeft(maxAttempts: number, used: number): number {
  return Math.max(0, Math.max(1, maxAttempts) - used);
}

/** Admin input for the attempt limit, clamped to a sane range. */
export const MAX_ATTEMPTS_LIMIT = 10;

export function clampMaxAttempts(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_ATTEMPTS_LIMIT, n);
}
