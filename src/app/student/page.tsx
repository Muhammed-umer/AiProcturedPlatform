import type { Metadata } from "next";
import Link from "next/link";
import { eq, and, sql, inArray, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  tests,
  testGroups,
  groupMembers,
  attempts,
  sections,
  questions,
} from "@/db/schema";
import { requireStudent } from "@/lib/session";
import { bestAttemptPerStudent, attemptsLeft } from "@/lib/attempts";
import { Badge, EmptyState, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "My tests" };

export const dynamic = "force-dynamic";

// The lab server's clock may not be set to India, so the zone is explicit.
const ZONE = "Asia/Kolkata";

function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: ZONE,
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function StudentDashboard() {
  const session = await requireStudent();

  // Every group this student belongs to.
  const memberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, session.userId));

  const groupIds = memberships.map((m) => m.groupId);

  const available =
    groupIds.length === 0
      ? []
      : await db
          .selectDistinct({
            id: tests.id,
            title: tests.title,
            instructions: tests.instructions,
            duration: tests.durationMinutes,
            maxAttempts: tests.maxAttempts,
            // Aliased columns: interpolated Drizzle columns render unqualified
            // inside a raw subquery, making "id" ambiguous otherwise.
            questionCount: sql<number>`(
              select count(*)::int from questions q
              join sections s on s.id = q.section_id
              where s.test_id = tests.id
            )`,
          })
          .from(tests)
          .innerJoin(testGroups, eq(testGroups.testId, tests.id))
          .where(
            and(
              inArray(testGroups.groupId, groupIds),
              eq(tests.status, "published"),
            ),
          );

  const myAttempts = await db
    .select({
      id: attempts.id,
      testId: attempts.testId,
      attemptNumber: attempts.attemptNumber,
      status: attempts.status,
      totalScore: attempts.totalScore,
      maxScore: attempts.maxScore,
    })
    .from(attempts)
    .where(eq(attempts.userId, session.userId))
    .orderBy(asc(attempts.attemptNumber));

  const attemptsByTest = new Map<string, typeof myAttempts>();
  for (const a of myAttempts) {
    attemptsByTest.set(a.testId, [...(attemptsByTest.get(a.testId) ?? []), a]);
  }

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONE,
  }).format(now);

  const cards = available.map((t) => {
    const mine = attemptsByTest.get(t.id) ?? [];
    const open = mine.find((a) => a.status === "in_progress");
    const finished = mine.filter((a) => a.status !== "in_progress");
    // The score shown is the best one, matching what results count.
    const [best] = bestAttemptPerStudent(
      finished.map((a) => ({ ...a, userId: session.userId })),
    );
    const left = attemptsLeft(t.maxAttempts, mine.length);
    const done = !open && finished.length > 0;
    return { t, mine, open, finished, best, left, done };
  });

  return (
    <div className="fade-up">
      <div className="mb-7">
        <p className="text-[13px] font-medium text-ink-3 mb-1">
          {greeting(now)} &middot; {today}
        </p>
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight">
          Hello, {session.name.split(" ")[0]}
        </h1>
      </div>

      <section>
        <SectionTitle>My tests</SectionTitle>
        {cards.length === 0 ? (
          <EmptyState
            title="No tests assigned yet"
            message="When your department publishes a test to your group, it will appear here."
          />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {cards.map(({ t, mine, open, finished, best, left, done }) => (
              <div key={t.id} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="font-bold text-[17px] leading-snug min-w-0">
                    {t.title}
                  </h2>
                  {done ? (
                    <Badge tone="good">Completed</Badge>
                  ) : open ? (
                    <Badge tone="warn">In progress</Badge>
                  ) : (
                    <Badge tone="brand">Available</Badge>
                  )}
                </div>

                <div className="text-[13.5px] text-ink-2 tabular-nums mb-3">
                  {t.duration} minutes &middot; {t.questionCount} question
                  {t.questionCount === 1 ? "" : "s"}
                  {t.maxAttempts > 1 && (
                    <>
                      {" "}
                      &middot; {mine.length} of {t.maxAttempts} attempts used
                    </>
                  )}
                </div>

                {t.instructions && !done && (
                  <p className="text-[13.5px] text-ink-2 mb-4 line-clamp-3 whitespace-pre-wrap">
                    {t.instructions}
                  </p>
                )}

                <div className="mt-auto pt-3 space-y-2.5">
                  {best && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[14.5px] font-semibold tabular-nums">
                        {best.totalScore !== null
                          ? `${Number(best.totalScore)} / ${Number(best.maxScore)}`
                          : "Submitted"}
                        {finished.length > 1 && (
                          <span className="ml-1.5 text-[12.5px] font-normal text-ink-3">
                            best of {finished.length}
                          </span>
                        )}
                      </span>
                      <Link
                        href={`/student/result/${best.id}`}
                        className="btn-ghost btn-sm"
                      >
                        View result
                      </Link>
                    </div>
                  )}

                  {open ? (
                    <Link
                      href={`/student/test/${t.id}`}
                      className="btn-primary w-full"
                    >
                      Resume test
                    </Link>
                  ) : left > 0 ? (
                    <Link
                      href={`/student/test/${t.id}`}
                      className="btn-primary w-full"
                    >
                      {finished.length === 0
                        ? "Start test"
                        : `Retake test (attempt ${mine.length + 1} of ${t.maxAttempts})`}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
