import ExcelJS from "exceljs";
import { eq, and, ne, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tests, attempts, users, sections, questions, answers } from "@/db/schema";
import { getSession } from "@/lib/session";
import { summarize, sectionAverages, type ScoreRow } from "@/lib/analytics";

/** Downloads the rank list and topic-wise analysis as a workbook. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Not authorised", { status: 403 });
  }

  const { id } = await params;

  const [test] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  if (!test) return new Response("Test not found", { status: 404 });

  const attemptRows = await db
    .select({
      id: attempts.id,
      userId: attempts.userId,
      totalScore: attempts.totalScore,
      maxScore: attempts.maxScore,
      warningCount: attempts.warningCount,
      status: attempts.status,
      submittedAt: attempts.submittedAt,
      rollNumber: users.rollNumber,
      name: users.name,
      email: users.email,
    })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .where(and(eq(attempts.testId, id), ne(attempts.status, "in_progress")));

  const scoreRows: ScoreRow[] = attemptRows.map((a) => ({
    userId: a.userId,
    rollNumber: a.rollNumber,
    name: a.name,
    totalScore: Number(a.totalScore ?? 0),
    maxScore: Number(a.maxScore ?? 0),
  }));

  const summary = summarize(scoreRows);
  const byUser = new Map(attemptRows.map((a) => [a.userId, a]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Placement Test Platform";

  /* -------------------------------------------------------- rank list */

  const sheet = wb.addWorksheet("Rank List");
  sheet.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "Roll Number", key: "roll", width: 16 },
    { header: "Name", key: "name", width: 28 },
    { header: "Email", key: "email", width: 28 },
    { header: "Score", key: "score", width: 10 },
    { header: "Out Of", key: "max", width: 10 },
    { header: "Percentage", key: "pct", width: 12 },
    { header: "Warnings", key: "warn", width: 10 },
    { header: "Status", key: "status", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of summary.ranked) {
    const a = byUser.get(r.userId);
    sheet.addRow({
      rank: r.rank,
      roll: r.rollNumber,
      name: r.name,
      email: a?.email ?? "",
      score: r.totalScore,
      max: r.maxScore,
      pct: r.percentage,
      warn: a?.warningCount ?? 0,
      status: a?.status ?? "",
    });
  }

  /* ---------------------------------------------------------- summary */

  const sum = wb.addWorksheet("Summary");
  sum.columns = [
    { header: "Measure", key: "k", width: 26 },
    { header: "Value", key: "v", width: 30 },
  ];
  sum.getRow(1).font = { bold: true };
  [
    ["Test", test.title],
    ["Duration (minutes)", test.durationMinutes],
    ["Submissions", summary.attempted],
    ["Average score", summary.average],
    ["Highest score", summary.highest],
    ["Lowest score", summary.lowest],
    ["Passed (40% or above)", summary.passCount],
    ["Pass percentage", `${summary.passPercentage}%`],
    ["Top performer", summary.topPerformer
      ? `${summary.topPerformer.name} (${summary.topPerformer.rollNumber})`
      : "-"],
    ["Lowest performer", summary.lowestPerformer
      ? `${summary.lowestPerformer.name} (${summary.lowestPerformer.rollNumber})`
      : "-"],
  ].forEach(([k, v]) => sum.addRow({ k, v }));

  /* ------------------------------------------------------ topic-wise */

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
      : [];

  const attemptIds = attemptRows.map((a) => a.id);
  const answerRows =
    attemptIds.length > 0
      ? await db
          .select()
          .from(answers)
          .where(inArray(answers.attemptId, attemptIds))
      : [];

  const sectionScoreRows = [];
  for (const attempt of attemptRows) {
    for (const section of sectionRows) {
      const qs = questionRows.filter((q) => q.sectionId === section.id);
      if (qs.length === 0) continue;

      const sectionMax = qs.reduce(
        (t, q) =>
          t +
          (q.marksOverride !== null
            ? Number(q.marksOverride)
            : Number(section.defaultMarks)),
        0,
      );
      const earned = qs.reduce((t, q) => {
        const a = answerRows.find(
          (r) => r.attemptId === attempt.id && r.questionId === q.id,
        );
        return t + (a?.awardedMarks ? Number(a.awardedMarks) : 0);
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

  const topic = wb.addWorksheet("Topic Analysis");
  topic.columns = [
    { header: "Section", key: "section", width: 20 },
    { header: "Topic", key: "topic", width: 22 },
    { header: "Average Score", key: "avg", width: 15 },
    { header: "Out Of", key: "max", width: 10 },
    { header: "Average %", key: "pct", width: 12 },
    { header: "Students", key: "n", width: 10 },
  ];
  topic.getRow(1).font = { bold: true };

  for (const s of sectionAverages(sectionScoreRows)) {
    topic.addRow({
      section: s.sectionName,
      topic: s.topic ?? "",
      avg: s.averageScore,
      max: s.maxScore,
      pct: s.averagePercentage,
      n: s.studentCount,
    });
  }

  const out = await wb.xlsx.writeBuffer();
  const safeName = test.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}-results.xlsx"`,
    },
  });
}
