"use server";

import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  users,
  answers,
  sections,
  questions,
  violations,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { finalizeAttempt } from "@/lib/exam-core";

export interface LiveAttempt {
  attemptId: string;
  rollNumber: string;
  name: string;
  status: string;
  answeredCount: number;
  totalQuestions: number;
  warningCount: number;
  remainingMs: number;
  lastViolation: string | null;
  startedAt: string;
  /** False while the student is still on the instructions screen. */
  begun: boolean;
  /** Whether the end-of-test photo was received. */
  hasPhoto: boolean;
  /** Warnings raised by the camera (no face, several faces, turned away). */
  cameraWarnings: number;
}

export interface LiveSnapshot {
  serverNow: number;
  inProgress: number;
  submitted: number;
  notStarted: number;
  attempts: LiveAttempt[];
}

/**
 * A single query-set the monitor page polls. Computes progress and time left
 * from the server clock, so what the invigilator sees is authoritative.
 */
export async function getLiveSnapshot(testId: string): Promise<LiveSnapshot> {
  await requireAdmin();

  // Total questions in the paper, for the progress denominator.
  const sectionRows = await db
    .select({ id: sections.id })
    .from(sections)
    .where(eq(sections.testId, testId));

  const sectionIds = sectionRows.map((s) => s.id);
  const [{ total } = { total: 0 }] =
    sectionIds.length > 0
      ? await db
          .select({ total: sql<number>`count(*)::int` })
          .from(questions)
          .where(inArray(questions.sectionId, sectionIds))
      : [{ total: 0 }];

  const attemptRows = await db
    .select({
      id: attempts.id,
      status: attempts.status,
      warningCount: attempts.warningCount,
      deadlineAt: attempts.deadlineAt,
      startedAt: attempts.startedAt,
      begunAt: attempts.begunAt,
      rollNumber: users.rollNumber,
      name: users.name,
      // Aliased columns: interpolated Drizzle columns render unqualified inside
      // a raw subquery, making "id" ambiguous against the outer attempts row.
      answeredCount: sql<number>`(
        select count(*)::int from answers ans
        where ans.attempt_id = attempts.id
          and (
            ans.text_answer is not null and ans.text_answer <> ''
            or jsonb_array_length(coalesce(ans.selected_option_ids, '[]'::jsonb)) > 0
          )
      )`,
      lastViolation: sql<string | null>`(
        select v.type from violations v
        where v.attempt_id = attempts.id
        order by v.occurred_at desc limit 1
      )`,
      hasPhoto: sql<boolean>`exists (
        select 1 from proctor_snapshots ps
        where ps.attempt_id = attempts.id and ps.kind = 'final'
      )`,
      cameraWarnings: sql<number>`(
        select count(*)::int from violations v
        where v.attempt_id = attempts.id
          and v.type in ('no_face', 'multiple_faces', 'looking_away', 'camera_off')
      )`,
    })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .where(eq(attempts.testId, testId))
    .orderBy(sql`${attempts.startedAt} desc`);

  const now = Date.now();

  const live: LiveAttempt[] = attemptRows.map((a) => ({
    attemptId: a.id,
    rollNumber: a.rollNumber,
    name: a.name,
    status: a.status,
    answeredCount: a.answeredCount,
    totalQuestions: total,
    warningCount: a.warningCount,
    // Before Continue the deadline is only provisional; show nothing.
    remainingMs:
      a.status === "in_progress" && a.begunAt
        ? Math.max(0, a.deadlineAt.getTime() - now)
        : 0,
    lastViolation: a.lastViolation,
    startedAt: a.startedAt.toISOString(),
    begun: a.begunAt !== null,
    hasPhoto: a.hasPhoto,
    cameraWarnings: a.cameraWarnings,
  }));

  return {
    serverNow: now,
    inProgress: live.filter((a) => a.status === "in_progress").length,
    submitted: live.filter((a) => a.status !== "in_progress").length,
    notStarted: 0,
    attempts: live,
  };
}

/**
 * Invigilator override: grade and close one attempt now. Recorded as a normal
 * submission, since the invigilator is choosing to end it on the student's
 * behalf rather than flagging misconduct.
 */
export async function forceSubmit(formData: FormData): Promise<void> {
  await requireAdmin();
  const attemptId = String(formData.get("attemptId") ?? "");
  if (attemptId) await finalizeAttempt(attemptId, "submitted");
}
