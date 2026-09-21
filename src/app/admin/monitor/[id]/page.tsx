import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tests } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { getLiveSnapshot } from "@/app/actions/monitor";
import { MonitorView } from "./monitor-view";

export const dynamic = "force-dynamic";

export default async function MonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [test] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  if (!test) notFound();

  const initial = await getLiveSnapshot(id);

  return (
    <div className="fade-up">
      <div className="mb-2">
        <Link
          href={`/admin/tests/${id}`}
          className="text-[13.5px] text-ink-3 hover:text-ink"
        >
          &larr; Back to test
        </Link>
      </div>

      <PageHeader
        title={`Monitoring: ${test.title}`}
        subtitle="Who is writing right now, how far along they are, and any warnings. This page refreshes on its own."
        action={
          <Link href={`/admin/results/${id}`} className="btn-ghost">
            Results
          </Link>
        }
      />

      <MonitorView testId={id} initial={initial} />
    </div>
  );
}
