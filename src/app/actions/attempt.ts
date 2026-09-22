"use server";

import { eq, and, inArray, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  tests,
  sections,
  questions,
  options,
  attempts,
  answers,
  violations,
  groupMembers,
  testGroups,
} from "@/db/schema";
import { requireStudent } from "@/lib/session";
import { randomSeed, seededShuffle, deriveSeed } from "@/lib/shuffle";
import { gradeAttempt, type GradableQuestion } from "@/lib/grading";
import { attemptsLeft } from "@/lib/attempts";

/** A question as the student sees it. Correct answers are never included. */
export interface StudentQuestion {
  id: string;
  sectionId: string;
  sectionName: string;
  type: "mcq_single" | "mcq_multiple" | "fill_blank";
  body: string;
  marks: number;
  options: { id: string; body: string }[];
}

export interface ExamPaper {
  attemptId: string;
  testTitle: string;
  instructions: string | null;
  maxWarnings: number;
  /** Which sitting this is, and how many the test allows. */
  attemptNumber: number;
  maxAttempts: number;
  /** Whether the webcam must be on and watched for this test. */
  cameraRequired: boolean;
  warningCount: number;
  /** Milliseconds left, computed from the server clock. */
  remainingMs: number;
  questions: StudentQuestion[];
  savedAnswers: Record<
    string,
    { selectedOptionIds: string[]; textAnswer: string }
  >;
}

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

/**
 * Starts an attempt, or resumes an existing one. The deadline is fixed on the
 * server the first time and never recomputed, so reloading the page or losing
 * power does not hand the student extra time.
 */
export async function startAttempt(testId: string): Promise<ExamPaper> {
  const session = await requireStudent();
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

    // Each attempt gets its own seed, so a retake is a freshly shuffled paper.
    const deadline = new Date(Date.now() + test.durationMinutes * 60_000);
    const [created] = await db
      .insert(attempts)
      .values({
        testId,
        userId: session.userId,
        attemptNumber: mine.length + 1,
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

  const sectionRows = await db
    .select()
    .from(sections)
    .where(eq(sections.testId, testId))
    .orderBy(asc(sections.ordinal));

  const sectionIds = sectionRows.map((s) => s.id);
  const questionRows =
    sectionIds.length > 0
      ? await db
          .select()
          .from(questions)
          .where(inArray(questions.sectionId, sectionIds))
          .orderBy(asc(questions.ordinal))
      : [];

  const optionRows =
    questionRows.length > 0
      ? await db
          .select({
            id: options.id,
            questionId: options.questionId,
            body: options.body,
            ordinal: options.ordinal,
          })
          .from(options)
          .where(
            inArray(
              options.questionId,
              questionRows.map((q) => q.id),
            ),
          )
          .orderBy(asc(options.ordinal))
      : [];

  // Build the paper in section order, shuffling within each section.
  const paper: StudentQuestion[] = [];

  for (const section of sectionRows) {
    let inSection = questionRows.filter((q) => q.sectionId === section.id);

    if (test.shuffleQuestions) {
      inSection = seededShuffle(
        inSection,
        deriveSeed(attempt.seed, `q:${section.id}`),
      );
    }

    for (const q of inSection) {
      let opts = optionRows
        .filter((o) => o.questionId === q.id)
        .map((o) => ({ id: o.id, body: o.body }));

      if (test.shuffleOptions && opts.length > 0) {
        opts = seededShuffle(opts, deriveSeed(attempt.seed, `o:${q.id}`));
      }

      paper.push({
        id: q.id,
        sectionId: section.id,
        sectionName: section.name,
        type: q.type,
        body: q.body,
        marks:
          q.marksOverride !== null
            ? Number(q.marksOverride)
            : Number(section.defaultMarks),
        options: opts,
      });
    }
  }

  const saved = await db
    .select()
    .from(answers)
    .where(eq(answers.attemptId, attempt.id));

  const savedAnswers: ExamPaper["savedAnswers"] = {};
  for (const a of saved) {
    savedAnswers[a.questionId] = {
      selectedOptionIds: a.selectedOptionIds ?? [],
      textAnswer: a.textAnswer ?? "",
    };
  }

  return {
    attemptId: attempt.id,
    testTitle: test.title,
    instructions: test.instructions,
    maxWarnings: test.maxWarnings,
    attemptNumber: attempt.attemptNumber,
    maxAttempts: test.maxAttempts,
    cameraRequired: test.cameraRequired,
    warningCount: attempt.warningCount,
    remainingMs: Math.max(0, attempt.deadlineAt.getTime() - Date.now()),
    questions: paper,
    savedAnswers,
  };
}

/** Saves one answer. Called as the student works, so nothing is lost. */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  value: { selectedOptionIds?: string[]; textAnswer?: string },
): Promise<{ ok: boolean; expired?: boolean }> {
  const session = await requireStudent();

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, session.userId)))
    .limit(1);

  if (!attempt || attempt.status !== "in_progress") return { ok: false };

  // The server clock decides, not the browser.
  if (attempt.deadlineAt.getTime() <= Date.now()) {
    await submitAttempt(attemptId, "auto_submitted");
    return { ok: false, expired: true };
  }

  await db
    .insert(answers)
    .values({
      attemptId,
      questionId,
      selectedOptionIds: value.selectedOptionIds ?? null,
      textAnswer: value.textAnswer ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [answers.attemptId, answers.questionId],
      set: {
        selectedOptionIds: value.selectedOptionIds ?? null,
        textAnswer: value.textAnswer ?? null,
        updatedAt: new Date(),
      },
    });

  return { ok: true };
}

const CAMERA_VIOLATIONS = new Set([
  "no_face",
  "multiple_faces",
  "looking_away",
  "camera_off",
]);

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

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, session.userId)))
    .limit(1);

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

  // A test with the camera off never counts a camera warning, whatever the
  // browser sends.
  if (test && !test.cameraRequired && CAMERA_VIOLATIONS.has(type)) {
    return {
      warningCount: attempt.warningCount,
      terminated: false,
      maxWarnings,
    };
  }
  const next = attempt.warningCount + 1;

  await db.insert(violations).values({
    attemptId,
    type,
    detail: detail ?? null,
  });

  await db
    .update(attempts)
    .set({ warningCount: next })
    .where(eq(attempts.id, attemptId));

  if (next >= maxWarnings) {
    await submitAttempt(attemptId, "terminated");
    return { warningCount: next, terminated: true, maxWarnings };
  }

  return { warningCount: next, terminated: false, maxWarnings };
}

/** Grades and closes an attempt. Safe to call more than once. */
export async function submitAttempt(
  attemptId: string,
  reason: "submitted" | "auto_submitted" | "terminated" = "submitted",
): Promise<{ ok: boolean; score?: number; maxScore?: number }> {
  const [attempt] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, attemptId))
    .limit(1);

  if (!attempt) return { ok: false };
  if (attempt.status !== "in_progress") {
    return {
      ok: true,
      score: Number(attempt.totalScore ?? 0),
      maxScore: Number(attempt.maxScore ?? 0),
    };
  }

  const sectionRows = await db
    .select()
    .from(sections)
    .where(eq(sections.testId, attempt.testId));

  const sectionIds = sectionRows.map((s) => s.id);
  const questionRows =
    sectionIds.length > 0
      ? await db
          .select()
          .from(questions)
          .where(inArray(questions.sectionId, sectionIds))
      : [];

  const optionRows =
    questionRows.length > 0
      ? await db
          .select()
          .from(options)
          .where(
            inArray(
              options.questionId,
              questionRows.map((q) => q.id),
            ),
          )
      : [];

  const savedAnswers = await db
    .select()
    .from(answers)
    .where(eq(answers.attemptId, attemptId));

  const gradable: GradableQuestion[] = questionRows.map((q) => {
    const section = sectionRows.find((s) => s.id === q.sectionId)!;
    return {
      id: q.id,
      type: q.type,
      sectionMarks: Number(section.defaultMarks),
      sectionNegative: Number(section.negativeMarks),
      marksOverride: q.marksOverride === null ? null : Number(q.marksOverride),
      negativeOverride:
        q.negativeOverride === null ? null : Number(q.negativeOverride),
      options: optionRows
        .filter((o) => o.questionId === q.id)
        .map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      acceptedAnswers: q.acceptedAnswers,
    };
  });

  const result = gradeAttempt(
    gradable,
    savedAnswers.map((a) => ({
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
      textAnswer: a.textAnswer,
    })),
  );

  // Write per-question outcomes back, which the analytics reads later.
  for (const graded of result.answers) {
    if (!graded.attempted) continue;
    await db
      .update(answers)
      .set({
        isCorrect: graded.isCorrect,
        awardedMarks: String(graded.awardedMarks),
      })
      .where(
        and(
          eq(answers.attemptId, attemptId),
          eq(answers.questionId, graded.questionId),
        ),
      );
  }

  await db
    .update(attempts)
    .set({
      status: reason === "submitted" ? "submitted" : reason,
      submittedAt: new Date(),
      totalScore: String(result.totalScore),
      maxScore: String(result.maxScore),
    })
    .where(eq(attempts.id, attemptId));

  return { ok: true, score: result.totalScore, maxScore: result.maxScore };
}

/** Called by the student's submit button. */
export async function submitOwnAttempt(
  attemptId: string,
): Promise<{ ok: boolean; score?: number; maxScore?: number }> {
  const session = await requireStudent();

  const [attempt] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, session.userId)))
    .limit(1);

  if (!attempt) return { ok: false };
  return submitAttempt(attemptId, "submitted");
}

/** Heartbeat, so the browser clock can never be the authority. */
export async function checkTime(
  attemptId: string,
): Promise<{ remainingMs: number; status: string }> {
  const session = await requireStudent();

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, session.userId)))
    .limit(1);

  if (!attempt) return { remainingMs: 0, status: "missing" };

  const remainingMs = Math.max(0, attempt.deadlineAt.getTime() - Date.now());

  if (remainingMs === 0 && attempt.status === "in_progress") {
    await submitAttempt(attemptId, "auto_submitted");
    return { remainingMs: 0, status: "auto_submitted" };
  }

  return { remainingMs, status: attempt.status };
}
