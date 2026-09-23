import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/session";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tests } from "@/db/schema";
import { BackLink, PageHeader } from "@/components/ui";
import { getLiveSnapshot } from "@/app/actions/monitor";
import { MonitorView } from "./monitor-view";

export const metadata: Metadata = { title: "Live monitor" };

export const dynamic = "force-dynamic";

export default async function MonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;

  const [test] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  if (!test) notFound();

  const initial = await getLiveSnapshot(id);

  return (
    <div className="fade-up">
      <BackLink href={`/admin/tests/${id}`}>Back to test</BackLink>

      <PageHeader
        title={`Monitoring: ${test.title}`}
        subtitle="Who is writing right now, how far along they are, and any warnings. This page refreshes on its own."
        action={
          <Link href={`/admin/results/${id}`} className="btn-ghost">
            Results
          </Link>
        }
      />

      <MonitorView
        testId={id}
        initial={initial}
        cameraRequired={test.cameraRequired}
      />
    </div>
  );
}
