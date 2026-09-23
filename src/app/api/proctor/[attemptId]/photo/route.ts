import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { proctorSnapshots } from "@/db/schema";
import { getSession } from "@/lib/session";
import { jpegResponse } from "@/lib/proctor-image";

export const dynamic = "force-dynamic";

/** The photo taken as the student's test ended. Admin only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { attemptId } = await params;

  const [row] = await db
    .select({ image: proctorSnapshots.image })
    .from(proctorSnapshots)
    .where(
      and(
        eq(proctorSnapshots.attemptId, attemptId),
        eq(proctorSnapshots.kind, "final"),
      ),
    )
    .limit(1);

  if (!row) return new Response("No photo", { status: 404 });
  return jpegResponse(row.image);
}
