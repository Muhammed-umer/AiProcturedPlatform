import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/session";
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
import {
  PageHeader,
  StatusBadge,
  Alert,
  Tooltip,
  BackLink,
  SubmitButton,
  ConfirmForm,
} from "@/components/ui";
import { setTestStatus, deleteTest } from "@/app/actions/admin";
import { GroupAssign } from "./group-assign";
import { SectionEditor } from "./section-editor";
import { QuestionForm } from "./question-form";
import { QuestionList } from "./question-list";
import { QuestionImport } from "./question-import";
import { DocumentImport } from "./document-import";
import { VisibilitySettings } from "./visibility-settings";
import { TestSettings } from "./test-settings";

export const metadata: Metadata = { title: "Edit test" };

export const dynamic = "force-dynamic";

export default async function TestBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
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
      <BackLink href="/admin/tests">All tests</BackLink>

      <PageHeader
        title={test.title}
        subtitle={`${test.durationMinutes} minutes · ${totalQuestions} question${
          totalQuestions === 1 ? "" : "s"
        } · ${totalMarks} mark${totalMarks === 1 ? "" : "s"} total`}
        action={
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge status={test.status} />

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
                  <SubmitButton
                    className="btn-primary"
                    disabled={!canPublish}
                    pendingText="Publishing…"
                  >
                    Publish
                  </SubmitButton>
                </form>
              </Tooltip>
            ) : (
              <Tooltip label="Stop any more students starting this test. Anyone already writing can finish, and all results are kept.">
                <form action={setTestStatus}>
                  <input type="hidden" name="testId" value={test.id} />
                  <input type="hidden" name="status" value="closed" />
                  <SubmitButton className="btn-ghost" pendingText="Closing…">
                    Close test
                  </SubmitButton>
                </form>
              </Tooltip>
            )}

            <Tooltip label="Delete this test for good, along with its sections, questions, and every attempt, result and webcam frame. This cannot be undone.">
              <ConfirmForm
                action={deleteTest}
                confirm={`Delete "${test.title}" for good? Its questions, attempts, results and webcam frames go with it. This cannot be undone.`}
              >
                <input type="hidden" name="testId" value={test.id} />
                <SubmitButton className="btn-danger" pendingText="Deleting…">
                  Delete
                </SubmitButton>
              </ConfirmForm>
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

        {/* Five cards are taller than a 768px screen, so the column only
            sticks on very wide screens, and then scrolls on its own. */}
        <div className="space-y-6 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100dvh-9.5rem)] 2xl:overflow-y-auto 2xl:overscroll-contain 2xl:p-1 2xl:-m-1">
          <GroupAssign
            testId={test.id}
            allGroups={allGroups}
            assignedIds={assignedIds}
            published={test.status === "published"}
          />
          <TestSettings
            testId={test.id}
            maxAttempts={test.maxAttempts}
            shuffleQuestions={test.shuffleQuestions}
            shuffleOptions={test.shuffleOptions}
            cameraRequired={test.cameraRequired}
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
