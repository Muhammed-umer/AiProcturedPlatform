import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  tests,
  sections,
  questions,
  options,
  groups,
  testGroups,
} from "@/db/schema";
import { PageHeader, Badge, Alert, Tooltip } from "@/components/ui";
import { setTestStatus, deleteTest } from "@/app/actions/admin";
import { GroupAssign } from "./group-assign";
import { SectionEditor } from "./section-editor";
import { QuestionForm } from "./question-form";
import { QuestionList } from "./question-list";
import { QuestionImport } from "./question-import";
import { DocumentImport } from "./document-import";
import { VisibilitySettings } from "./visibility-settings";

export const dynamic = "force-dynamic";

export default async function TestBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [test] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  if (!test) notFound();

  const sectionRows = await db
    .select()
    .from(sections)
    .where(eq(sections.testId, id))
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

  const allGroups = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .orderBy(groups.name);

  const assigned = await db
    .select({ groupId: testGroups.groupId })
    .from(testGroups)
    .where(eq(testGroups.testId, id));

  const assignedIds = assigned.map((a) => a.groupId);
  const totalQuestions = questionRows.length;

  const totalMarks = questionRows.reduce((sum, q) => {
    const section = sectionRows.find((s) => s.id === q.sectionId);
    const marks =
      q.marksOverride !== null
        ? Number(q.marksOverride)
        : Number(section?.defaultMarks ?? 1);
    return sum + marks;
  }, 0);

  const canPublish = totalQuestions > 0 && assignedIds.length > 0;

  return (
    <div className="fade-up">
      <div className="mb-2">
        <Link
          href="/admin/tests"
          className="text-[13.5px] text-ink-3 hover:text-ink"
        >
          &larr; All tests
        </Link>
      </div>

      <PageHeader
        title={test.title}
        subtitle={`${test.durationMinutes} minutes · ${totalQuestions} question${
          totalQuestions === 1 ? "" : "s"
        } · ${totalMarks} mark${totalMarks === 1 ? "" : "s"} total`}
        action={
          <div className="flex flex-wrap gap-2 items-center">
            <Badge
              tone={
                test.status === "published"
                  ? "good"
                  : test.status === "closed"
                    ? "neutral"
                    : "warn"
              }
            >
              {test.status}
            </Badge>

            {test.status === "published" && (
              <Link href={`/admin/monitor/${test.id}`} className="btn-ghost">
                Monitor live
              </Link>
            )}

            {test.status !== "published" ? (
              <Tooltip
                label={
                  canPublish
                    ? "Open this test to the groups it is assigned to. Students in those groups can start it from then on."
                    : "Add at least one question and assign a group first."
                }
              >
                <form action={setTestStatus}>
                  <input type="hidden" name="testId" value={test.id} />
                  <input type="hidden" name="status" value="published" />
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!canPublish}
                  >
                    Publish
                  </button>
                </form>
              </Tooltip>
            ) : (
              <Tooltip label="Stop any more students starting this test. Anyone already writing can finish, and all results are kept.">
                <form action={setTestStatus}>
                  <input type="hidden" name="testId" value={test.id} />
                  <input type="hidden" name="status" value="closed" />
                  <button type="submit" className="btn-ghost">
                    Close test
                  </button>
                </form>
              </Tooltip>
            )}

            <Tooltip label="Delete this test for good, along with its sections, questions, and every attempt, result and webcam frame. This cannot be undone.">
              <form action={deleteTest}>
                <input type="hidden" name="testId" value={test.id} />
                <button type="submit" className="btn-danger">
                  Delete
                </button>
              </form>
            </Tooltip>
          </div>
        }
      />

      {!canPublish && test.status !== "published" && (
        <div className="mb-5">
          <Alert tone="warn">
            {totalQuestions === 0
              ? "Add at least one question before publishing."
              : "Assign this test to at least one group before publishing."}
          </Alert>
        </div>
      )}

      <div className="grid xl:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <SectionEditor testId={test.id} sections={sectionRows} />

          <QuestionForm testId={test.id} sections={sectionRows} />

          <QuestionList
            testId={test.id}
            sections={sectionRows}
            questions={questionRows}
            options={optionRows}
          />
        </div>

        <div className="space-y-6 xl:sticky xl:top-32">
          <GroupAssign
            testId={test.id}
            allGroups={allGroups}
            assignedIds={assignedIds}
            published={test.status === "published"}
          />
          <VisibilitySettings
            testId={test.id}
            showScore={test.showScoreToStudent}
            showAnswers={test.showAnswersToStudent}
          />
          <QuestionImport testId={test.id} />
          <DocumentImport testId={test.id} />
        </div>
      </div>
    </div>
  );
}
