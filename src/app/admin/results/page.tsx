import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { tests, attempts } from "@/db/schema";
import { PageHeader, TableWrap, EmptyState, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Results" };

export const dynamic = "force-dynamic";

export default async function ResultsIndexPage() {
  await requireAdminPage();
  const rows = await db
    .select({
      id: tests.id,
      title: tests.title,
      status: tests.status,
      // Aliased columns: interpolated Drizzle columns render unqualified inside
      // a raw subquery, making "id" ambiguous against the outer tests row.
      attemptCount: sql<number>`(
        select count(*)::int from attempts a
        where a.test_id = tests.id
      )`,
      submittedCount: sql<number>`(
        select count(*)::int from attempts a
        where a.test_id = tests.id
          and a.status <> 'in_progress'
      )`,
    })
    .from(tests)
    .orderBy(sql`${tests.createdAt} desc`);

  const withAttempts = rows.filter((r) => r.attemptCount > 0);

  return (
    <div className="fade-up">
      <PageHeader
        title="Results"
        subtitle="Rankings, class averages and topic-wise analysis for every test that has been attempted."
      />

      {withAttempts.length === 0 ? (
        <EmptyState
          title="No attempts yet"
          message="Once students start taking a test, its results appear here."
        />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead className="bg-canvas border-b border-line">
              <tr>
                <th className="th">Test</th>
                <th className="th">Status</th>
                <th className="th">Started</th>
                <th className="th">Submitted</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {withAttempts.map((t) => (
                <tr key={t.id} className="hover:bg-brand-50/40 transition">
                  <td className="td font-semibold text-ink">{t.title}</td>
                  <td className="td">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="td tabular-nums">{t.attemptCount}</td>
                  <td className="td tabular-nums">{t.submittedCount}</td>
                  <td className="td text-right">
                    <Link
                      href={`/admin/results/${t.id}`}
                      className="btn-ghost btn-sm"
                    >
                      Analyse
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
