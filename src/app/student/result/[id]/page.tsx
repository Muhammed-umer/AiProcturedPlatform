import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  tests,
  sections,
  questions,
  options,
  answers,
} from "@/db/schema";
import { requireStudent } from "@/lib/session";
import { PageHeader, StatCard, Alert, TableWrap } from "@/components/ui";
import { AnswerReview } from "./answer-review";

export const metadata: Metadata = { title: "Your result" };

export const dynamic = "force-dynamic";

export default async function StudentResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string; terminated?: string }>;
}) {
  const { id } = await params;
  const flags = await searchParams;
  const session = await requireStudent();

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, id), eq(attempts.userId, session.userId)))
    .limit(1);

  if (!attempt) notFound();
  // The review below carries the answer key. While the attempt is open it
  // must not be reachable, from a second tab or a phone signed in alongside.
  if (attempt.status === "in_progress") redirect(`/student/test/${attempt.testId}`);

  const [test] = await db
    .select()
    .from(tests)
    .where(eq(tests.id, attempt.testId))
    .limit(1);

  const score = Number(attempt.totalScore ?? 0);
  const maxScore = Number(attempt.maxScore ?? 0);
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;

  // Section-wise breakdown for the student's own attempt.
  const sectionRows = await db
    .select()
    .from(sections)
    .where(eq(sections.testId, attempt.testId));

  const sectionIds = sectionRows.map((s) => s.id);
  const questionRows =
    sectionIds.length > 0
      ? await db
          .select({
            id: questions.id,
            sectionId: questions.sectionId,
            type: questions.type,
            body: questions.body,
            ordinal: questions.ordinal,
            acceptedAnswers: questions.acceptedAnswers,
            explanation: questions.explanation,
          })
          .from(questions)
          .where(inArray(questions.sectionId, sectionIds))
      : [];

  const questionIds = questionRows.map((q) => q.id);
  const optionRows =
    questionIds.length > 0
      ? await db
          .select()
          .from(options)
          .where(inArray(options.questionId, questionIds))
      : [];

  const answerRows = await db
    .select({
      questionId: answers.questionId,
      isCorrect: answers.isCorrect,
      awardedMarks: answers.awardedMarks,
      selectedOptionIds: answers.selectedOptionIds,
      textAnswer: answers.textAnswer,
    })
    .from(answers)
    .where(eq(answers.attemptId, attempt.id));

  const answerByQuestion = new Map(answerRows.map((a) => [a.questionId, a]));

  const breakdown = sectionRows.map((s) => {
    const qs = questionRows.filter((q) => q.sectionId === s.id);
    let correct = 0;
    let earned = 0;
    for (const q of qs) {
      const a = answerByQuestion.get(q.id);
      if (a?.isCorrect) correct++;
      if (a?.awardedMarks) earned += Number(a.awardedMarks);
    }
    return {
      name: s.name,
      topic: s.topic,
      correct,
      total: qs.length,
      earned: Math.max(0, Math.round(earned * 100) / 100),
    };
  });

  // Question by question, in the paper order rather than the shuffled order
  // this particular student happened to see.
  const sectionOrder = new Map(sectionRows.map((s) => [s.id, s.ordinal]));
  const review = questionRows
    .slice()
    .sort(
      (a, b) =>
        (sectionOrder.get(a.sectionId) ?? 0) -
          (sectionOrder.get(b.sectionId) ?? 0) || a.ordinal - b.ordinal,
    )
    .map((q) => {
      const given = answerByQuestion.get(q.id);
      const chosen = new Set(given?.selectedOptionIds ?? []);
      return {
        id: q.id,
        type: q.type,
        body: q.body,
        sectionName: sectionRows.find((s) => s.id === q.sectionId)?.name ?? "",
        explanation: q.explanation,
        acceptedAnswers: q.acceptedAnswers ?? [],
        textAnswer: given?.textAnswer ?? "",
        isCorrect: Boolean(given?.isCorrect),
        attempted: chosen.size > 0 || Boolean(given?.textAnswer?.trim()),
        awardedMarks: given?.awardedMarks ? Number(given.awardedMarks) : 0,
        options: optionRows
          .filter((o) => o.questionId === q.id)
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((o) => ({
            id: o.id,
            body: o.body,
            isCorrect: o.isCorrect,
            chosen: chosen.has(o.id),
          })),
      };
    });

  const showReview = Boolean(test?.showAnswersToStudent) && review.length > 0;

  return (
    <div className="fade-up">
      {flags.terminated && (
        <div className="mb-5">
          <Alert tone="error">
            This test was submitted automatically because the allowed number of
            warnings was reached.
          </Alert>
        </div>
      )}
      {flags.auto && !flags.terminated && (
        <div className="mb-5">
          <Alert tone="warn">
            Time ran out, so your test was submitted automatically.
          </Alert>
        </div>
      )}

      <PageHeader
        title={test?.title ?? "Result"}
        subtitle={
          (test?.maxAttempts ?? 1) > 1
            ? `Attempt ${attempt.attemptNumber} of ${test?.maxAttempts}. Your submission has been recorded.`
            : "Your submission has been recorded."
        }
        action={
          <Link href="/student" className="btn-ghost">
            Back to my tests
          </Link>
        }
      />

      {test?.showScoreToStudent ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
            <StatCard
              label="Score"
              value={`${score} / ${maxScore}`}
              tone="brand"
            />
            <StatCard label="Percentage" value={`${pct}%`} />
            <StatCard
              label="Warnings"
              value={attempt.warningCount}
              tone={attempt.warningCount > 0 ? "bad" : "default"}
            />
            <StatCard
              label="Status"
              value={
                attempt.status === "terminated"
                  ? "Ended early"
                  : attempt.status === "auto_submitted"
                    ? "Timed out"
                    : "Submitted"
              }
            />
          </div>

          {breakdown.length > 0 && (
            <>
              <h2 className="text-[17px] font-bold tracking-tight mb-3">
                Section breakdown
              </h2>
              <TableWrap>
                <table className="w-full">
                  <thead className="bg-canvas border-b border-line">
                    <tr>
                      <th className="th">Section</th>
                      <th className="th">Correct</th>
                      <th className="th">Marks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {breakdown.map((b) => (
                      <tr key={b.name}>
                        <td className="td font-semibold text-ink">
                          {b.name}
                          {b.topic && (
                            <span className="ml-2 text-[13px] font-normal text-ink-3">
                              {b.topic}
                            </span>
                          )}
                        </td>
                        <td className="td tabular-nums">
                          {b.correct} of {b.total}
                        </td>
                        <td className="td tabular-nums font-medium text-ink">
                          {b.earned}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </>
          )}

          {showReview && <AnswerReview review={review} />}
        </>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-[15px] text-ink-2">
            Your answers have been submitted. Results will be published by your
            department.
          </p>
        </div>
      )}
    </div>
  );
}
