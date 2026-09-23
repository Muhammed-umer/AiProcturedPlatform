"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  proctorSnapshots,
  tests,
  users,
  violations,
} from "@/db/schema";
import { requireStudent, requireAdmin } from "@/lib/session";

// A 320x240 JPEG at moderate quality is 20-50 KB; base64 adds a third. Anything
// past this is not a webcam frame from our exam page.
const MAX_IMAGE_CHARS = 200_000;

/**
 * The photo is taken as the test ends, and the browser may only manage to
 * send it a moment after the server has closed the attempt (a time-out or a
 * termination closes it server-side first). This is how long after closing
 * the photo is still accepted.
 */
const PHOTO_GRACE_MS = 2 * 60_000;

function stripDataUrl(value: string): string {
  const marker = value.indexOf("base64,");
  return (marker >= 0 ? value.slice(marker + 7) : value).trim();
}

/**
 * Stores the one webcam photo kept per attempt: the frame captured as the
 * student's test ends. Nothing is uploaded during the test itself; the
 * camera's judgements arrive as named warnings through recordViolation.
 * Mirrors saveAnswer: the student must own the attempt.
 */
export async function uploadFinalPhoto(
  attemptId: string,
  image: string,
): Promise<{ ok: boolean }> {
  const session = await requireStudent();

  if (typeof attemptId !== "string" || typeof image !== "string") {
    return { ok: false };
  }
  const data = stripDataUrl(image);
  if (
    data.length === 0 ||
    data.length > MAX_IMAGE_CHARS ||
    !/^[A-Za-z0-9+/=]+$/.test(data)
  ) {
    return { ok: false };
  }

  const [attempt] = await db
    .select({
      id: attempts.id,
      status: attempts.status,
      begunAt: attempts.begunAt,
      submittedAt: attempts.submittedAt,
      cameraRequired: tests.cameraRequired,
    })
    .from(attempts)
    .innerJoin(tests, eq(tests.id, attempts.testId))
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, session.userId)))
    .limit(1);

  if (!attempt || !attempt.begunAt || !attempt.cameraRequired) {
    return { ok: false };
  }
  const closedFor =
    attempt.status === "in_progress"
      ? 0
      : Date.now() - (attempt.submittedAt?.getTime() ?? 0);
  if (closedFor > PHOTO_GRACE_MS) return { ok: false };

  // One row per attempt, replaced in place. Safe if two sends cross.
  await db
    .insert(proctorSnapshots)
    .values({ attemptId, kind: "final", image: data, takenAt: new Date() })
    .onConflictDoUpdate({
      target: proctorSnapshots.attemptId,
      targetWhere: sql`kind = 'final'`,
      set: { image: data, takenAt: new Date() },
    });
  return { ok: true };
}

export interface ReviewWarning {
  type: string;
  at: string;
}

export interface ProctorReview {
  attemptId: string;
  testId: string;
  rollNumber: string;
  name: string;
  status: string;
  warningCount: number;
  /** Whether the end-of-test photo was received. */
  hasPhoto: boolean;
  photoAt: string | null;
  /** Every warning, camera or otherwise, in the order it happened. */
  warnings: ReviewWarning[];
}

/**
 * Everything the review page needs except the photo itself, which the
 * browser fetches from the image route so this stays small.
 */
export async function getProctorReview(
  attemptId: string,
): Promise<ProctorReview | null> {
  await requireAdmin();

  const [attempt] = await db
    .select({
      id: attempts.id,
      testId: attempts.testId,
      status: attempts.status,
      warningCount: attempts.warningCount,
      rollNumber: users.rollNumber,
      name: users.name,
    })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .where(eq(attempts.id, attemptId))
    .limit(1);

  if (!attempt) return null;

  const [photo] = await db
    .select({ takenAt: proctorSnapshots.takenAt })
    .from(proctorSnapshots)
    .where(
      and(
        eq(proctorSnapshots.attemptId, attemptId),
        eq(proctorSnapshots.kind, "final"),
      ),
    )
    .limit(1);

  const rows = await db
    .select({ type: violations.type, at: violations.occurredAt })
    .from(violations)
    .where(eq(violations.attemptId, attemptId))
    .orderBy(asc(violations.occurredAt));

  return {
    attemptId: attempt.id,
    testId: attempt.testId,
    rollNumber: attempt.rollNumber,
    name: attempt.name,
    status: attempt.status,
    warningCount: attempt.warningCount,
    hasPhoto: Boolean(photo),
    photoAt: photo?.takenAt.toISOString() ?? null,
    warnings: rows.map((r) => ({ type: r.type, at: r.at.toISOString() })),
  };
}
