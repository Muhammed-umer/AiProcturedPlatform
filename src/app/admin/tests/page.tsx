import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  tests,
  sections,
  questions,
  testGroups,
  groups,
  attempts,
} from "@/db/schema";
import { PageHeader, TableWrap, StatusBadge, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Tests" };

export const dynamic = "force-dynamic";

export default async function TestsPage() {
  await requireAdminPage();
  const rows = await db
    .select({
      id: tests.id,
      title: tests.title,
      status: tests.status,
      duration: tests.durationMinutes,
      // Aliased, fully-qualified columns: interpolated Drizzle columns render
      // unqualified inside a raw subquery, making "id" ambiguous otherwise.
      questionCount: sql<number>`(
        select count(*)::int from questions q
        join sections s on s.id = q.section_id
        where s.test_id = tests.id
      )`,
      groupNames: sql<string | null>`(
        select string_agg(g.name, ', ' order by g.name)
        from test_groups tg
        join groups g on g.id = tg.group_id
        where tg.test_id = tests.id
      )`,
      attemptCount: sql<number>`(
        select count(*)::int from attempts a
        where a.test_id = tests.id
      )`,
    })
    .from(tests)
    .orderBy(sql`${tests.createdAt} desc`);

  return (
    <div className="fade-up">
      <PageHeader
        title="Tests"
        subtitle="Build a paper, assign it to groups, then publish it."
        action={
          <Link href="/admin/tests/new" className="btn-primary">
            Create test
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No tests yet"
          message="Create a test, add sections and questions, then publish it to a group."
          action={
            <Link href="/admin/tests/new" className="btn-primary">
              Create your first test
            </Link>
          }
        />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead className="bg-canvas border-b border-line">
              <tr>
                <th className="th">Test</th>
                <th className="th">Status</th>
                <th className="th">Questions</th>
                <th className="th">Duration</th>
                <th className="th">Groups</th>
                <th className="th">Attempts</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-brand-50/40 transition">
                  <td className="td font-semibold text-ink">{t.title}</td>
                  <td className="td">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="td tabular-nums">{t.questionCount}</td>
                  <td className="td tabular-nums">{t.duration} min</td>
                  <td className="td">
                    {t.groupNames ?? (
                      <span className="text-ink-3">Not assigned</span>
                    )}
                  </td>
                  <td className="td tabular-nums">{t.attemptCount}</td>
                  <td className="td text-right whitespace-nowrap">
                    <div className="flex gap-2 justify-end">
                      <Link
                        href={`/admin/tests/${t.id}`}
                        className="btn-ghost btn-sm"
                      >
                        Edit
                      </Link>
                      {t.attemptCount > 0 && (
                        <Link
                          href={`/admin/results/${t.id}`}
                          className="btn-ghost btn-sm"
                        >
                          Results
                        </Link>
                      )}
                    </div>
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
