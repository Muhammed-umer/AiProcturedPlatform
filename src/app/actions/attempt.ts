"use server";

import { eq, and, asc, sql, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  tests,
  attempts,
  answers,
  violations,
  groupMembers,
  testGroups,
} from "@/db/schema";
import { requireStudent } from "@/lib/session";
import { randomSeed } from "@/lib/shuffle";
import { attemptsLeft } from "@/lib/attempts";
import { CAMERA_VIOLATIONS } from "@/lib/violation-labels";
import {
  loadTestContent,
  buildPaper,
  cleanAnswer,
  finalizeAttempt,
  type StudentQuestion,
} from "@/lib/exam-core";

export type { StudentQuestion } from "@/lib/exam-core";

type SavedAnswers = Record<
  string,
  { selectedOptionIds: string[]; textAnswer: string }
>;

export interface ExamPaper {
  attemptId: string;
  testTitle: string;
  instructions: string | null;
  durationMinutes: number;
  questionCount: number;
  maxWarnings: number;
  /** Which sitting this is, and how many the test allows. */
  attemptNumber: number;
  maxAttempts: number;
  /** Whether the webcam must be on and watched for this test. */
  cameraRequired: boolean;
  warningCount: number;
  /**
   * False until the student presses Continue on the instructions screen.
   * Until then the clock has not started and `questions` is empty: the paper
   * is only sent once the sitting has really begun.
   */
  begun: boolean;
  /** Milliseconds left, computed from the server clock. */
  remainingMs: number;
  questions: StudentQuestion[];
  savedAnswers: SavedAnswers;
}

/** What Continue hands back: the paper itself and the real clock. */
export interface BegunPaper {
  remainingMs: number;
  questions: StudentQuestion[];
  savedAnswers: SavedAnswers;
}

/**
 * How long a student may sit on the instructions screen before the clock
 * starts anyway. Long enough for a slow camera or a restart of the browser,
 * short enough that an unopened attempt cannot be held for days.
 */
const INSTRUCTIONS_GRACE_MS = 30 * 60_000;

/** The violations the exam page can raise. Anything else is refused. */
const VIOLATION_TYPES = new Set([
  "tab_switch",
  "window_blur",
  "fullscreen_exit",
  "copy_paste",
  "devtools",
  "print_screen",
  "no_face",
  "multiple_faces",
  "looking_away",
  "camera_off",
]);

/** Confirms this student is in a group the test is published to. */
async function assertEligible(userId: string, testId: string) {
  const rows = await db
    .select({ id: testGroups.id })
    .from(testGroups)
    .innerJoin(
      groupMembers,
      and(
        eq(groupMembers.groupId, testGroups.groupId),
        eq(groupMembers.userId, userId),
      ),
    )
    .where(eq(testGroups.testId, testId))
    .limit(1);

  if (rows.length === 0) throw new Error("NOT_ELIGIBLE");
}

/** The student's own attempt, or nothing. Every action checks through here. */
async function ownAttempt(attemptId: unknown, userId: string) {
  if (typeof attemptId !== "string") return null;
  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);
  return attempt ?? null;
}

async function savedAnswersFor(attemptId: string): Promise<SavedAnswers> {
  const saved = await db
    .select()
    .from(answers)
    .where(eq(answers.attemptId, attemptId));
  const out: SavedAnswers = {};
  for (const a of saved) {
    out[a.questionId] = {
      selectedOptionIds: a.selectedOptionIds ?? [],
      textAnswer: a.textAnswer ?? "",
    };
  }
  return out;
}

/**
 * Opens the instructions screen for a test: creates the attempt, or resumes
 * the unfinished one. The paper itself is only included once the attempt has
 * begun; see beginAttempt.
 */
export async function startAttempt(testId: string): Promise<ExamPaper> {
  const session = await requireStudent();
  if (typeof testId !== "string") throw new Error("NOT_FOUND");
  await assertEligible(session.userId, testId);

  const [test] = await db
    .select()
    .from(tests)
    .where(eq(tests.id, testId))
    .limit(1);

  if (!test) throw new Error("NOT_FOUND");
  if (test.status !== "published") throw new Error("NOT_OPEN");

  const mine = await db
    .select()
    .from(attempts)
    .where(
      and(eq(attempts.testId, testId), eq(attempts.userId, session.userId)),
    )
    .orderBy(asc(attempts.attemptNumber));

  // An unfinished attempt is always resumed, never replaced, so reloading or
  // losing power cannot be used to get a fresh paper or a fresh clock.
  let attempt = mine.find((a) => a.status === "in_progress");

  if (!attempt) {
    if (attemptsLeft(test.maxAttempts, mine.length) === 0) {
      throw new Error("ALREADY_SUBMITTED");
    }

    // A provisional deadline. Pressing Continue replaces it with the real
    // one; if the student never does, the attempt still closes by itself.
    const deadline = new Date(
      Date.now() + INSTRUCTIONS_GRACE_MS + test.durationMinutes * 60_000,
    );
    const [created] = await db
      .insert(attempts)
      .values({
        testId,
        userId: session.userId,
        attemptNumber: mine.length + 1,
        // Each attempt gets its own seed, so a retake is a freshly
        // shuffled paper.
        seed: randomSeed(),
        deadlineAt: deadline,
      })
      // Two tabs starting at once race for the same number; the loser picks
      // up the winner's row below instead of opening a second attempt.
      .onConflictDoNothing()
      .returning();

    attempt =
      created ??
      (
        await db
          .select()
          .from(attempts)
          .where(
            and(
              eq(attempts.testId, testId),
              eq(attempts.userId, session.userId),
              eq(attempts.attemptNumber, mine.length + 1),
            ),
          )
          .limit(1)
      )[0];

    if (!attempt || attempt.status !== "in_progress") {
      throw new Error("ALREADY_SUBMITTED");
    }
  }

  const content = await loadTestContent(testId);
  const begun = attempt.begunAt !== null;

  return {
    attemptId: attempt.id,
    testTitle: test.title,
    instructions: test.instructions,
    durationMinutes: test.durationMinutes,
    questionCount: content.questions.length,
    maxWarnings: test.maxWarnings,
    attemptNumber: attempt.attemptNumber,
    maxAttempts: test.maxAttempts,
    cameraRequired: test.cameraRequired,
    warningCount: attempt.warningCount,
    begun,
    remainingMs: begun
      ? Math.max(0, attempt.deadlineAt.getTime() - Date.now())
      : test.durationMinutes * 60_000,
    questions: begun
      ? buildPaper(content, attempt.seed, {
          questions: test.shuffleQuestions,
          options: test.shuffleOptions,
        })
      : [],
    savedAnswers: begun ? await savedAnswersFor(attempt.id) : {},
  };
}

/**
 * The student pressed Continue. Starts the real clock (once; later calls,
 * from a reload or a second tab, keep the first start) and hands over the
 * paper.
 */
export async function beginAttempt(
  attemptId: string,
): Promise<BegunPaper | { error: string }> {
  const session = await requireStudent();
  const attempt = await ownAttempt(attemptId, session.userId);
  if (!attempt || attempt.status !== "in_progress") {
    return { error: "This attempt is no longer open." };
  }

  const [test] = await db
    .select()
    .from(tests)
    .where(eq(tests.id, attempt.testId))
    .limit(1);
  if (!test) return { error: "This test no longer exists." };

  // The deadline is the start plus the duration, but never later than the
  // provisional one: waiting on the instructions screen buys no extra time.
  await db
    .update(attempts)
    .set({
      begunAt: new Date(),
      deadlineAt: sql`least(${attempts.deadlineAt}, now() + make_interval(mins => ${test.durationMinutes}))`,
    })
    .where(and(eq(attempts.id, attempt.id), isNull(attempts.begunAt)));

  const [current] = await db
    .select({ deadlineAt: attempts.deadlineAt, seed: attempts.seed })
    .from(attempts)
    .where(eq(attempts.id, attempt.id))
    .limit(1);

  const content = await loadTestContent(test.id);
  return {
    remainingMs: Math.max(0, current.deadlineAt.getTime() - Date.now()),
    questions: buildPaper(content, current.seed, {
      questions: test.shuffleQuestions,
      options: test.shuffleOptions,
    }),
    savedAnswers: await savedAnswersFor(attempt.id),
  };
}

/** Saves one answer. Called as the student works, so nothing is lost. */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  value: { selectedOptionIds?: string[]; textAnswer?: string },
): Promise<{ ok: boolean; expired?: boolean }> {
  const session = await requireStudent();
  const attempt = await ownAttempt(attemptId, session.userId);

  if (!attempt || attempt.status !== "in_progress" || !attempt.begunAt) {
    return { ok: false };
  }

  // The server clock decides, not the browser.
  if (attempt.deadlineAt.getTime() <= Date.now()) {
    await finalizeAttempt(attempt.id, "auto_submitted");
    return { ok: false, expired: true };
  }

  // Only an answer to a question on this test, using that question's own
  // options, is stored.
  const content = await loadTestContent(attempt.testId);
  const clean = cleanAnswer(content, questionId, value);
  if (!clean) return { ok: false };

  await db
    .insert(answers)
    .values({
      attemptId: attempt.id,
      questionId,
      selectedOptionIds: clean.selectedOptionIds,
      textAnswer: clean.textAnswer,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [answers.attemptId, answers.questionId],
      set: {
        selectedOptionIds: clean.selectedOptionIds,
        textAnswer: clean.textAnswer,
        updatedAt: new Date(),
      },
    });

  return { ok: true };
}

/**
 * Records a lockdown violation and returns the running count. The server
 * decides when the limit is reached, so disconnecting cannot dodge it.
 */
export async function recordViolation(
  attemptId: string,
  type: string,
  detail?: string,
): Promise<{ warningCount: number; terminated: boolean; maxWarnings: number }> {
  const session = await requireStudent();
  const attempt = await ownAttempt(attemptId, session.userId);

  if (!attempt || attempt.status !== "in_progress") {
    return { warningCount: 0, terminated: true, maxWarnings: 0 };
  }

  const [test] = await db
    .select({
      maxWarnings: tests.maxWarnings,
      cameraRequired: tests.cameraRequired,
    })
    .from(tests)
    .where(eq(tests.id, attempt.testId))
    .limit(1);

  const maxWarnings = test?.maxWarnings ?? 3;
  const unchanged = {
    warningCount: attempt.warningCount,
    terminated: false,
    maxWarnings,
  };

  // Nothing counts before the student has begun, nothing the exam page
  // could not have raised is stored, and a test with the camera off never
  // counts a camera warning, whatever the browser sends.
  if (!attempt.begunAt) return unchanged;
  if (typeof type !== "string" || !VIOLATION_TYPES.has(type)) return unchanged;
  if (test && !test.cameraRequired && CAMERA_VIOLATIONS.has(type)) {
    return unchanged;
  }

  // Counted in the database, not read, added to and written back, so two
  // warnings arriving together both count.
  const [counted] = await db
    .update(attempts)
    .set({ warningCount: sql`${attempts.warningCount} + 1` })
    .where(and(eq(attempts.id, attempt.id), eq(attempts.status, "in_progress")))
    .returning({ warningCount: attempts.warningCount });

  if (!counted) return { warningCount: attempt.warningCount, terminated: true, maxWarnings };

  await db.insert(violations).values({
    attemptId: attempt.id,
    type,
    detail: typeof detail === "string" ? detail.slice(0, 200) : null,
  });

  if (counted.warningCount >= maxWarnings) {
    await finalizeAttempt(attempt.id, "terminated");
    return { warningCount: counted.warningCount, terminated: true, maxWarnings };
  }

  return { warningCount: counted.warningCount, terminated: false, maxWarnings };
}

/** Called by the student's submit button. */
export async function submitOwnAttempt(
  attemptId: string,
): Promise<{ ok: boolean; score?: number; maxScore?: number }> {
  const session = await requireStudent();
  const attempt = await ownAttempt(attemptId, session.userId);
  if (!attempt) return { ok: false };
  return finalizeAttempt(attempt.id, "submitted");
}

/** Heartbeat, so the browser clock can never be the authority. */
export async function checkTime(
  attemptId: string,
): Promise<{ remainingMs: number; status: string }> {
  const session = await requireStudent();
  const attempt = await ownAttempt(attemptId, session.userId);

  if (!attempt) return { remainingMs: 0, status: "missing" };

  const remainingMs = Math.max(0, attempt.deadlineAt.getTime() - Date.now());

  if (remainingMs === 0 && attempt.status === "in_progress") {
    await finalizeAttempt(attempt.id, "auto_submitted");
    return { remainingMs: 0, status: "auto_submitted" };
  }

  return { remainingMs, status: attempt.status };
}
