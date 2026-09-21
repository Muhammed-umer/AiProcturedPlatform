import { eq } from "drizzle-orm";
import { db } from "@/db";
import { proctorSnapshots } from "@/db/schema";
import { getSession } from "@/lib/session";
import { jpegResponse } from "@/lib/proctor-image";

export const dynamic = "force-dynamic";

/** One stored frame by id, used by the camera-review page. Admin only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ snapshotId: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { snapshotId } = await params;

  const [row] = await db
    .select({ image: proctorSnapshots.image })
    .from(proctorSnapshots)
    .where(eq(proctorSnapshots.id, snapshotId))
    .limit(1);

  if (!row) return new Response("Not found", { status: 404 });
  return jpegResponse(row.image);
}
