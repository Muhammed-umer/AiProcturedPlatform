import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { getProctorReview } from "@/app/actions/proctor";

export const dynamic = "force-dynamic";

const FLAG_LABEL: Record<string, string> = {
  no_face: "Face not visible",
  multiple_faces: "More than one person",
  looking_away: "Turned away from screen",
  camera_off: "Camera turned off",
};

function when(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Everything the camera saw for one attempt: the live frame while the student
 * is writing, and the frame captured at each camera violation.
 */
export default async function ProctorReviewPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id, attemptId } = await params;

  const review = await getProctorReview(attemptId);
  if (!review || review.testId !== id) notFound();

  const live = review.status === "in_progress";

  return (
    <div className="fade-up">
      <div className="mb-2">
        <Link
          href={`/admin/monitor/${id}`}
          className="text-[13.5px] text-ink-3 hover:text-ink"
        >
          &larr; Back to monitoring
        </Link>
      </div>

      <PageHeader
        title={`Camera: ${review.name}`}
        subtitle={`${review.rollNumber} · ${
          live ? "writing now" : "attempt finished"
        } · ${review.warningCount} warning${
          review.warningCount === 1 ? "" : "s"
        }`}
        action={
          live ? <Badge tone="brand">Live</Badge> : <Badge tone="good">Done</Badge>
        }
      />

      <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
        <div className="card p-4">
          <h2 className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3 mb-3">
            {live ? "Latest frame" : "Last frame"}
          </h2>
          {review.hasLatest ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic, auth-gated frame
            <img
              src={`/api/proctor/${review.attemptId}/latest?t=${Date.now()}`}
              alt={`Latest webcam frame for ${review.rollNumber}`}
              className="w-full aspect-[4/3] rounded-lg border border-line bg-ink object-cover"
            />
          ) : (
            <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-line-2 bg-canvas grid place-items-center text-[13px] text-ink-3">
              No frame received yet
            </div>
          )}
          {live && (
            <p className="text-[12px] text-ink-3 mt-2">
              Reload this page for a newer frame. The monitor page refreshes on
              its own.
            </p>
          )}
        </div>

        <div>
          <h2 className="text-[15px] font-bold tracking-tight mb-3">
            Flagged moments
            {review.flagged.length > 0 && (
              <span className="ml-2 text-ink-3 font-medium tabular-nums">
                {review.flagged.length}
              </span>
            )}
          </h2>

          {review.flagged.length === 0 ? (
            <EmptyState
              title="Nothing flagged by the camera"
              message="A frame is saved here whenever the camera sees no face for a while, more than one person, or is switched off."
            />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {review.flagged.map((f) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-red-200 bg-red-50/40 p-2.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamic, auth-gated frame */}
                  <img
                    src={`/api/proctor/snapshot/${f.id}`}
                    alt={`${FLAG_LABEL[f.flagType ?? ""] ?? f.flagType} at ${when(f.takenAt)}`}
                    className="w-full aspect-[4/3] rounded-lg border border-line bg-ink object-cover"
                  />
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-[13px] font-semibold text-red-800">
                      {FLAG_LABEL[f.flagType ?? ""] ?? f.flagType ?? "Flagged"}
                    </span>
                    <span className="text-[12px] text-ink-3 tabular-nums">
                      {when(f.takenAt)}
                    </span>
                  </div>
                  {f.faceCount !== null && (
                    <div className="text-[11.5px] text-ink-3 mt-0.5">
                      {f.faceCount} face{f.faceCount === 1 ? "" : "s"} counted
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
