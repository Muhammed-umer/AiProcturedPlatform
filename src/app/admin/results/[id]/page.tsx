import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray, and, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  tests,
  attempts,
  users,
  sections,
  questions,
  answers,
  options,
} from "@/db/schema";
import { bestAttemptPerStudent } from "@/lib/attempts";
import {
  summarize,
  sectionAverages,
  questionStats,
  type ScoreRow,
  type SectionScoreRow,
  type QuestionOutcome,
} from "@/lib/analytics";
import {
  PageHeader,
  StatCard,
  TableWrap,
  Badge,
  EmptyState,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TestAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [test] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  if (!test) notFound();

  const allAttempts = await db
    .select({
      id: attempts.id,
      userId: attempts.userId,
      attemptNumber: attempts.attemptNumber,
      status: attempts.status,
      totalScore: attempts.totalScore,
      maxScore: attempts.maxScore,
      warningCount: attempts.warningCount,
      rollNumber: users.rollNumber,
      name: users.name,
    })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .where(and(eq(attempts.testId, id), ne(attempts.status, "in_progress")));

  // A test may allow retakes; each student is ranked on their best one.
  const attemptRows = bestAttemptPerStudent(allAttempts);

  if (attemptRows.length === 0) {
    return (
      <div className="fade-up">
        <PageHeader title={test.title} subtitle="No submissions yet." />
        <EmptyState
          title="Nothing to analyse"
          message="Results appear here once students submit."
          action={
            <Link href="/admin/results" className="btn-ghost">
              Back to results
            </Link>
          }
        />
      </div>
    );
  }

  /* ------------------------------------------------------- rankings -- */

  const scoreRows: ScoreRow[] = attemptRows.map((a) => ({
    userId: a.userId,
    rollNumber: a.rollNumber,
    name: a.name,
    totalScore: Number(a.totalScore ?? 0),
    maxScore: Number(a.maxScore ?? 0),
  }));

  const summary = summarize(scoreRows);
  const warningsByUser = new Map(
    attemptRows.map((a) => [a.userId, a.warningCount]),
  );
  const attemptsByUser = new Map<string, number>();
  for (const a of allAttempts) {
    attemptsByUser.set(a.userId, (attemptsByUser.get(a.userId) ?? 0) + 1);
  }
  const showAttempts = test.maxAttempts > 1;

  /* ------------------------------------------------- section & item -- */

  const sectionRows = await db
    .select()
    .from(sections)
    .where(eq(sections.testId, id))
    .orderBy(sections.ordinal);

  const sectionIds = sectionRows.map((s) => s.id);
  const questionRows =
    sectionIds.length > 0
      ? await db
          .select()
          .from(questions)
          .where(inArray(questions.sectionId, sectionIds))
          .orderBy(questions.ordinal)
      : [];

  const attemptIds = attemptRows.map((a) => a.id);
  const answerRows =
    attemptIds.length > 0
      ? await db
          .select()
          .from(answers)
          .where(inArray(answers.attemptId, attemptIds))
      : [];

  // Per-student, per-section scores feeding the topic-wise averages.
  const sectionScoreRows: SectionScoreRow[] = [];

  for (const attempt of attemptRows) {
    for (const section of sectionRows) {
      const qs = questionRows.filter((q) => q.sectionId === section.id);
      if (qs.length === 0) continue;

      const sectionMax = qs.reduce(
        (sum, q) =>
          sum +
          (q.marksOverride !== null
            ? Number(q.marksOverride)
            : Number(section.defaultMarks)),
        0,
      );

      const earned = qs.reduce((sum, q) => {
        const a = answerRows.find(
          (r) => r.attemptId === attempt.id && r.questionId === q.id,
        );
        return sum + (a?.awardedMarks ? Number(a.awardedMarks) : 0);
      }, 0);

      sectionScoreRows.push({
        sectionId: section.id,
        sectionName: section.name,
        topic: section.topic,
        score: Math.max(0, earned),
        maxScore: sectionMax,
      });
    }
  }

  const bySection = sectionAverages(sectionScoreRows).sort(
    (a, b) =>
      sectionRows.findIndex((s) => s.id === a.sectionId) -
      sectionRows.findIndex((s) => s.id === b.sectionId),
  );

  // Per-question difficulty. Every submitted attempt counts as a response.
  const outcomes: QuestionOutcome[] = [];
  for (const attempt of attemptRows) {
    for (const q of questionRows) {
      const a = answerRows.find(
        (r) => r.attemptId === attempt.id && r.questionId === q.id,
      );
      outcomes.push({
        questionId: q.id,
        isCorrect: a?.isCorrect === true,
        attempted: Boolean(a),
      });
    }
  }

  const stats = questionStats(outcomes);
  const statByQuestion = new Map(stats.map((s) => [s.questionId, s]));

  return (
    <div className="fade-up">
      <div className="mb-2">
        <Link
          href="/admin/results"
          className="text-[13.5px] text-ink-3 hover:text-ink"
        >
          &larr; All results
        </Link>
      </div>

      <PageHeader
        title={test.title}
        subtitle={`${summary.attempted} submission${summary.attempted === 1 ? "" : "s"}`}
        action={
          <a href={`/api/export/${id}`} className="btn-primary">
            Export to Excel
          </a>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatCard label="Submitted" value={summary.attempted} />
        <StatCard label="Average" value={summary.average} tone="brand" />
        <StatCard label="Highest" value={summary.highest} tone="good" />
        <StatCard label="Lowest" value={summary.lowest} tone="bad" />
        <StatCard
          label="Passed"
          value={`${summary.passCount}`}
          hint={`${summary.passPercentage}% at 40% or above`}
        />
      </div>

      {/* Top and bottom */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {summary.topPerformer && (
          <div className="card p-5 border-emerald-200 bg-emerald-50">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-emerald-700">
              Top performer
            </div>
            <div className="text-[19px] font-bold mt-1.5">
              {summary.topPerformer.name}
            </div>
            <div className="text-[13.5px] text-emerald-800 tabular-nums mt-0.5">
              {summary.topPerformer.rollNumber} &middot;{" "}
              {summary.topPerformer.totalScore} /{" "}
              {summary.topPerformer.maxScore} ({summary.topPerformer.percentage}
              %)
            </div>
          </div>
        )}
        {summary.lowestPerformer && (
          <div className="card p-5 border-red-200 bg-red-50">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-red-700">
              Lowest performer
            </div>
            <div className="text-[19px] font-bold mt-1.5">
              {summary.lowestPerformer.name}
            </div>
            <div className="text-[13.5px] text-red-800 tabular-nums mt-0.5">
              {summary.lowestPerformer.rollNumber} &middot;{" "}
              {summary.lowestPerformer.totalScore} /{" "}
              {summary.lowestPerformer.maxScore} (
              {summary.lowestPerformer.percentage}%)
            </div>
          </div>
        )}
      </div>

      {/* Topic-wise */}
      {bySection.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[17px] font-bold tracking-tight mb-1">
            Topic-wise performance
          </h2>
          <p className="text-[14px] text-ink-2 mb-3 max-w-[62ch]">
            Class average per section. A low bar shows a topic the batch needs
            more work on.
          </p>
          <div className="card p-5 space-y-4">
            {bySection.map((s) => (
              <div key={s.sectionId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
                  <span className="font-semibold text-[14.5px]">
                    {s.sectionName}
                    {s.topic && (
                      <span className="ml-2 font-normal text-ink-3 text-[13px]">
                        {s.topic}
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] text-ink-2 tabular-nums">
                    {s.averageScore} / {s.maxScore} &middot;{" "}
                    {s.averagePercentage}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-canvas border border-line overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      s.averagePercentage >= 60
                        ? "bg-emerald-500"
                        : s.averagePercentage >= 40
                          ? "bg-brand-500"
                          : "bg-red-400"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(2, s.averagePercentage))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rank list */}
      <section className="mb-8">
        <h2 className="text-[17px] font-bold tracking-tight mb-3">Rank list</h2>
        <TableWrap>
          <table className="w-full">
            <thead className="bg-canvas border-b border-line">
              <tr>
                <th className="th">Rank</th>
                <th className="th">Roll number</th>
                <th className="th">Name</th>
                <th className="th">Score</th>
                <th className="th">Percentage</th>
                <th className="th">Warnings</th>
                {showAttempts && <th className="th">Attempts</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {summary.ranked.map((r) => {
                const warnings = warningsByUser.get(r.userId) ?? 0;
                return (
                  <tr
                    key={r.userId}
                    className="hover:bg-brand-50/40 transition"
                  >
                    <td className="td font-bold text-ink tabular-nums">
                      {r.rank}
                    </td>
                    <td className="td tabular-nums">{r.rollNumber}</td>
                    <td className="td text-ink">{r.name}</td>
                    <td className="td tabular-nums font-medium text-ink">
                      {r.totalScore} / {r.maxScore}
                    </td>
                    <td className="td tabular-nums">{r.percentage}%</td>
                    <td className="td">
                      {warnings > 0 ? (
                        <Badge tone="bad">{warnings}</Badge>
                      ) : (
                        <span className="text-ink-3">&mdash;</span>
                      )}
                    </td>
                    {showAttempts && (
                      <td className="td tabular-nums">
                        {attemptsByUser.get(r.userId) ?? 1} of{" "}
                        {test.maxAttempts}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </section>

      {/* Question difficulty */}
      <section>
        <h2 className="text-[17px] font-bold tracking-tight mb-1">
          Question analysis
        </h2>
        <p className="text-[14px] text-ink-2 mb-3 max-w-[62ch]">
          How many students answered each question correctly. A question almost
          nobody gets right is often a badly worded one.
        </p>
        <TableWrap>
          <table className="w-full">
            <thead className="bg-canvas border-b border-line">
              <tr>
                <th className="th">#</th>
                <th className="th">Section</th>
                <th className="th">Question</th>
                <th className="th">Correct</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {questionRows.map((q, i) => {
                const stat = statByQuestion.get(q.id);
                const pct = stat?.correctPercentage ?? 0;
                const section = sectionRows.find((s) => s.id === q.sectionId);
                return (
                  <tr key={q.id}>
                    <td className="td tabular-nums text-ink-3">{i + 1}</td>
                    <td className="td whitespace-nowrap">{section?.name}</td>
                    <td className="td text-ink max-w-[420px]">
                      <span className="line-clamp-2">{q.body}</span>
                    </td>
                    <td className="td whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums font-medium text-ink w-14">
                          {stat?.correctCount ?? 0}/{stat?.totalResponses ?? 0}
                        </span>
                        <span
                          className={`chip ${
                            pct >= 60
                              ? "bg-emerald-100 text-emerald-800"
                              : pct >= 30
                                ? "bg-brand-100 text-brand-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </section>
    </div>
  );
}
