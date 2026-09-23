import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/session";
import {
  BackLink,
  PageHeader,
  Badge,
  EmptyState,
  TableWrap,
} from "@/components/ui";
import { getProctorReview } from "@/app/actions/proctor";
import { VIOLATION_LABEL } from "@/lib/violation-labels";

export const metadata: Metadata = { title: "Warnings review" };

export const dynamic = "force-dynamic";

function when(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * One attempt's record: every warning by name and time, and the single photo
 * taken as the test ended. No frames are kept from during the test.
 */
export default async function ProctorReviewPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  await requireAdminPage();
  const { id, attemptId } = await params;

  const review = await getProctorReview(attemptId);
  if (!review || review.testId !== id) notFound();

  const live = review.status === "in_progress";

  return (
    <div className="fade-up">
      <BackLink href={`/admin/monitor/${id}`}>Back to monitoring</BackLink>

      <PageHeader
        title={`Warnings: ${review.name}`}
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
            Photo at the end of the test
          </h2>
          {review.hasPhoto ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic, auth-gated frame */}
              <img
                src={`/api/proctor/${review.attemptId}/photo`}
                alt={`${review.rollNumber} as the test ended`}
                className="w-full aspect-[4/3] rounded-lg border border-line bg-ink object-cover"
              />
              {review.photoAt && (
                <p className="text-[12px] text-ink-3 mt-2 tabular-nums">
                  Taken at {when(review.photoAt)}
                </p>
              )}
            </>
          ) : (
            <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-line-2 bg-canvas grid place-items-center px-4 text-center text-[13px] text-ink-3">
              {live
                ? "Taken when the student submits."
                : "No photo was received. The camera was off for this test, or the browser closed before it could send one."}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-[15px] font-bold tracking-tight mb-3">
            Warnings
            {review.warnings.length > 0 && (
              <span className="ml-2 text-ink-3 font-medium tabular-nums">
                {review.warnings.length}
              </span>
            )}
          </h2>

          {review.warnings.length === 0 ? (
            <EmptyState
              title="No warnings"
              message="Nothing was flagged: the camera saw one face, facing the screen, and the student stayed on the test."
            />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead className="bg-canvas border-b border-line">
                  <tr>
                    <th className="th">#</th>
                    <th className="th">Time</th>
                    <th className="th">Warning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {review.warnings.map((w, i) => (
                    <tr key={`${w.at}-${i}`}>
                      <td className="td tabular-nums text-ink-3">{i + 1}</td>
                      <td className="td tabular-nums">{when(w.at)}</td>
                      <td className="td font-semibold text-red-800">
                        {VIOLATION_LABEL[w.type] ?? w.type}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
      </div>
    </div>
  );
}
