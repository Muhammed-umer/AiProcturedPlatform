"use server";

import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { attempts, proctorSnapshots, tests, users } from "@/db/schema";
import { requireStudent, requireAdmin } from "@/lib/session";

export type SnapshotKind = "latest" | "flagged";

// A 320x240 JPEG at moderate quality is 20-50 KB; base64 adds a third. Anything
// past this is not a webcam frame from our exam page.
const MAX_IMAGE_CHARS = 200_000;

function stripDataUrl(value: string): string {
  const marker = value.indexOf("base64,");
  return (marker >= 0 ? value.slice(marker + 7) : value).trim();
}

/**
 * Stores one webcam frame for the student's own in-progress attempt. Mirrors
 * saveAnswer: the student must own the attempt and it must still be running.
 * "latest" replaces the previous live thumbnail; "flagged" rows accumulate.
 */
export async function uploadSnapshot(
  attemptId: string,
  image: string,
  kind: SnapshotKind,
  meta?: { flagType?: string; faceCount?: number },
): Promise<{ ok: boolean }> {
  const session = await requireStudent();

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
      cameraRequired: tests.cameraRequired,
    })
    .from(attempts)
    .innerJoin(tests, eq(tests.id, attempts.testId))
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, session.userId)))
    .limit(1);

  if (!attempt || attempt.status !== "in_progress") return { ok: false };
  // No webcam frames are kept for a test with the camera switched off.
  if (!attempt.cameraRequired) return { ok: false };

  const row = {
    attemptId,
    kind,
    flagType: meta?.flagType ?? null,
    faceCount: meta?.faceCount ?? null,
    image: data,
    takenAt: new Date(),
  };

  if (kind === "latest") {
    await db.transaction(async (tx) => {
      await tx
        .delete(proctorSnapshots)
        .where(
          and(
            eq(proctorSnapshots.attemptId, attemptId),
            eq(proctorSnapshots.kind, "latest"),
          ),
        );
      await tx.insert(proctorSnapshots).values(row);
    });
  } else {
    await db.insert(proctorSnapshots).values(row);
  }

  return { ok: true };
}

export interface FlaggedSnapshotMeta {
  id: string;
  flagType: string | null;
  faceCount: number | null;
  takenAt: string;
}

export interface ProctorReview {
  attemptId: string;
  testId: string;
  rollNumber: string;
  name: string;
  status: string;
  warningCount: number;
  hasLatest: boolean;
  flagged: FlaggedSnapshotMeta[];
}

/**
 * Everything the camera-review page needs except the images themselves, which
 * the browser fetches from the image routes so this stays small.
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

  const rows = await db
    .select({
      id: proctorSnapshots.id,
      kind: proctorSnapshots.kind,
      flagType: proctorSnapshots.flagType,
      faceCount: proctorSnapshots.faceCount,
      takenAt: proctorSnapshots.takenAt,
    })
    .from(proctorSnapshots)
    .where(eq(proctorSnapshots.attemptId, attemptId))
    .orderBy(desc(proctorSnapshots.takenAt));

  return {
    attemptId: attempt.id,
    testId: attempt.testId,
    rollNumber: attempt.rollNumber,
    name: attempt.name,
    status: attempt.status,
    warningCount: attempt.warningCount,
    hasLatest: rows.some((r) => r.kind === "latest"),
    flagged: rows
      .filter((r) => r.kind === "flagged")
      .map((r) => ({
        id: r.id,
        flagType: r.flagType,
        faceCount: r.faceCount,
        takenAt: r.takenAt.toISOString(),
      })),
  };
}
