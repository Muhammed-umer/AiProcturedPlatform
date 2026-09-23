/**
 * The server-side heart of a sitting: the test's content, the student's
 * paper, what counts as a valid answer, and grading.
 *
 * Deliberately NOT a "use server" module. Everything exported from one of
 * those is a public endpoint; grading and closing an attempt must only ever
 * be reached through the checked actions that call in here.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sections, questions, options, answers, attempts } from "@/db/schema";
import { seededShuffle, deriveSeed } from "@/lib/shuffle";
import { gradeAttempt, type GradableQuestion } from "@/lib/grading";

/* ------------------------------------------------------------ content -- */

export interface TestContent {
  sections: (typeof sections.$inferSelect)[];
  questions: (typeof questions.$inferSelect)[];
  options: (typeof options.$inferSelect)[];
  /** questionId -> its option ids, for validating answers. */
  optionIdsByQuestion: Map<string, Set<string>>;
  questionById: Map<string, typeof questions.$inferSelect>;
}

/**
 * A lab of students all read the same test at the same moment. Holding it
 * briefly means one set of queries serves the whole room instead of one per
 * student. Short enough that an edit made while fixing a typo shows up at
 * once for anyone starting after it.
 */
const CONTENT_TTL_MS = 10_000;
const contentCache = new Map<
  string,
  { at: number; value: Promise<TestContent> }
>();

export function loadTestContent(testId: string): Promise<TestContent> {
  const hit = contentCache.get(testId);
  if (hit && Date.now() - hit.at < CONTENT_TTL_MS) return hit.value;

  const value = readTestContent(testId);
  contentCache.set(testId, { at: Date.now(), value });
  // A failed read must not be served to everyone for the next ten seconds.
  value.catch(() => contentCache.delete(testId));
  return value;
}

async function readTestContent(testId: string): Promise<TestContent> {
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
          .select()
          .from(options)
          .where(
            inArray(
              options.questionId,
              questionRows.map((q) => q.id),
            ),
          )
          .orderBy(asc(options.ordinal))
      : [];

  const optionIdsByQuestion = new Map<string, Set<string>>();
  for (const o of optionRows) {
    if (!optionIdsByQuestion.has(o.questionId)) {
      optionIdsByQuestion.set(o.questionId, new Set());
    }
    optionIdsByQuestion.get(o.questionId)!.add(o.id);
  }

  return {
    sections: sectionRows,
    questions: questionRows,
    options: optionRows,
    optionIdsByQuestion,
    questionById: new Map(questionRows.map((q) => [q.id, q])),
  };
}

/* -------------------------------------------------------------- paper -- */

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

/**
 * The student's own paper: sections in order, questions and options shuffled
 * by the attempt's seed, so it is the same paper on every reload.
 */
export function buildPaper(
  content: TestContent,
  seed: number,
  shuffle: { questions: boolean; options: boolean },
): StudentQuestion[] {
  const optionsByQuestion = new Map<string, { id: string; body: string }[]>();
  for (const o of content.options) {
    if (!optionsByQuestion.has(o.questionId)) optionsByQuestion.set(o.questionId, []);
    // Only the id and text: never isCorrect.
    optionsByQuestion.get(o.questionId)!.push({ id: o.id, body: o.body });
  }

  const paper: StudentQuestion[] = [];
  for (const section of content.sections) {
    let inSection = content.questions.filter((q) => q.sectionId === section.id);
    if (shuffle.questions) {
      inSection = seededShuffle(inSection, deriveSeed(seed, `q:${section.id}`));
    }

    for (const q of inSection) {
      let opts = optionsByQuestion.get(q.id) ?? [];
      if (shuffle.options && opts.length > 0) {
        opts = seededShuffle(opts, deriveSeed(seed, `o:${q.id}`));
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
  return paper;
}

/* ------------------------------------------------------------ answers -- */

export const MAX_TEXT_ANSWER = 500;

export type CleanAnswer = {
  selectedOptionIds: string[] | null;
  textAnswer: string | null;
};

/**
 * Checks an answer against the question it claims to answer. Returns null
 * for anything the exam page itself could never send: a question from
 * another test, an option from another question, two picks on a one-answer
 * question, or text of silly length.
 */
export function cleanAnswer(
  content: TestContent,
  questionId: unknown,
  value: unknown,
): CleanAnswer | null {
  if (typeof questionId !== "string") return null;
  const question = content.questionById.get(questionId);
  if (!question || !value || typeof value !== "object") return null;

  const raw = value as { selectedOptionIds?: unknown; textAnswer?: unknown };

  if (question.type === "fill_blank") {
    if (raw.textAnswer === undefined || raw.textAnswer === null) {
      return { selectedOptionIds: null, textAnswer: null };
    }
    if (typeof raw.textAnswer !== "string") return null;
    if (raw.textAnswer.length > MAX_TEXT_ANSWER) return null;
    return { selectedOptionIds: null, textAnswer: raw.textAnswer };
  }

  const picked = raw.selectedOptionIds ?? [];
  if (!Array.isArray(picked)) return null;
  const valid = content.optionIdsByQuestion.get(questionId) ?? new Set();
  const unique = [...new Set(picked)];
  if (unique.some((id) => typeof id !== "string" || !valid.has(id))) return null;
  if (question.type === "mcq_single" && unique.length > 1) return null;
  return { selectedOptionIds: unique as string[], textAnswer: null };
}

/* ------------------------------------------------------------ closing -- */

export type CloseReason = "submitted" | "auto_submitted" | "terminated";

/**
 * Grades and closes an attempt. Safe to call any number of times, from any
 * number of requests at once: the first statement claims the attempt, and
 * only the request that wins the claim grades it. The claim and the grading
 * commit together, so a crash part-way leaves the attempt open rather than
 * closed with no score.
 */
export async function finalizeAttempt(
  attemptId: string,
  reason: CloseReason,
): Promise<{ ok: boolean; score?: number; maxScore?: number }> {
  const [row] = await db
    .select({
      testId: attempts.testId,
      status: attempts.status,
      totalScore: attempts.totalScore,
      maxScore: attempts.maxScore,
    })
    .from(attempts)
    .where(eq(attempts.id, attemptId))
    .limit(1);
  if (!row) return { ok: false };
  if (row.status !== "in_progress") {
    return {
      ok: true,
      score: Number(row.totalScore ?? 0),
      maxScore: Number(row.maxScore ?? 0),
    };
  }

  // Read before the transaction opens. Fetching it inside would hold one
  // pooled connection while waiting for another, and a full lab submitting
  // at once could then exhaust the pool with every request waiting.
  const content = await loadTestContent(row.testId);

  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(attempts)
      .set({ status: reason, submittedAt: new Date() })
      .where(and(eq(attempts.id, attemptId), eq(attempts.status, "in_progress")))
      .returning();

    if (!claimed) {
      // Already closed by someone else: report what they recorded.
      const [existing] = await tx
        .select({ totalScore: attempts.totalScore, maxScore: attempts.maxScore })
        .from(attempts)
        .where(eq(attempts.id, attemptId))
        .limit(1);
      if (!existing) return { ok: false };
      return {
        ok: true,
        score: Number(existing.totalScore ?? 0),
        maxScore: Number(existing.maxScore ?? 0),
      };
    }

    const sectionById = new Map(content.sections.map((s) => [s.id, s]));
    const optionsByQuestion = new Map<string, { id: string; isCorrect: boolean }[]>();
    for (const o of content.options) {
      if (!optionsByQuestion.has(o.questionId)) optionsByQuestion.set(o.questionId, []);
      optionsByQuestion.get(o.questionId)!.push({ id: o.id, isCorrect: o.isCorrect });
    }

    const gradable: GradableQuestion[] = content.questions.map((q) => {
      const section = sectionById.get(q.sectionId)!;
      return {
        id: q.id,
        type: q.type,
        sectionMarks: Number(section.defaultMarks),
        sectionNegative: Number(section.negativeMarks),
        marksOverride: q.marksOverride === null ? null : Number(q.marksOverride),
        negativeOverride:
          q.negativeOverride === null ? null : Number(q.negativeOverride),
        options: optionsByQuestion.get(q.id) ?? [],
        acceptedAnswers: q.acceptedAnswers,
      };
    });

    const saved = await tx
      .select()
      .from(answers)
      .where(eq(answers.attemptId, attemptId));

    const result = gradeAttempt(
      gradable,
      saved.map((a) => ({
        questionId: a.questionId,
        selectedOptionIds: a.selectedOptionIds,
        textAnswer: a.textAnswer,
      })),
    );

    // Every per-question outcome in one statement, rather than one round
    // trip per question while a whole lab submits at the same second.
    const outcomes = result.answers.filter((g) => g.attempted);
    if (outcomes.length > 0) {
      const rows = sql.join(
        outcomes.map(
          (g) =>
            sql`(${g.questionId}::uuid, ${g.isCorrect}::boolean, ${String(g.awardedMarks)}::numeric)`,
        ),
        sql`, `,
      );
      await tx.execute(sql`
        update answers as a
        set is_correct = v.is_correct, awarded_marks = v.awarded_marks
        from (values ${rows}) as v(question_id, is_correct, awarded_marks)
        where a.attempt_id = ${attemptId} and a.question_id = v.question_id`);
    }

    await tx
      .update(attempts)
      .set({
        totalScore: String(result.totalScore),
        maxScore: String(result.maxScore),
      })
      .where(eq(attempts.id, attemptId));

    return { ok: true, score: result.totalScore, maxScore: result.maxScore };
  });
}
