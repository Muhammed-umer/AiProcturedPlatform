import Link from "next/link";
import { sql, eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  groups,
  tests,
  attempts,
  passwordResetRequests,
} from "@/db/schema";
import { PageHeader, StatCard, Badge, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

async function counts() {
  const [studentCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "student"));

  const [groupCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groups);

  const [testCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tests);

  const [liveCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attempts)
    .where(eq(attempts.status, "in_progress"));

  const [pendingResets] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(passwordResetRequests)
    .where(eq(passwordResetRequests.status, "pending"));

  return {
    students: studentCount?.n ?? 0,
    groups: groupCount?.n ?? 0,
    tests: testCount?.n ?? 0,
    live: liveCount?.n ?? 0,
    resets: pendingResets?.n ?? 0,
  };
}

export default async function AdminDashboard() {
  const stats = await counts();

  const recentTests = await db
    .select({
      id: tests.id,
      title: tests.title,
      status: tests.status,
      duration: tests.durationMinutes,
      createdAt: tests.createdAt,
    })
    .from(tests)
    .orderBy(sql`${tests.createdAt} desc`)
    .limit(6);

  return (
    <div className="fade-up">
      <PageHeader
        title="Dashboard"
        subtitle="An overview of students, tests and anything waiting on you."
        action={
          <Link href="/admin/tests/new" className="btn-primary">
            Create test
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatCard label="Students" value={stats.students} />
        <StatCard label="Groups" value={stats.groups} />
        <StatCard label="Tests" value={stats.tests} />
        <StatCard
          label="In progress"
          value={stats.live}
          tone={stats.live > 0 ? "brand" : "default"}
          hint={stats.live > 0 ? "Students writing now" : undefined}
        />
        <StatCard
          label="Reset requests"
          value={stats.resets}
          tone={stats.resets > 0 ? "bad" : "default"}
          hint={stats.resets > 0 ? "Waiting for you" : undefined}
        />
      </div>

      <h2 className="text-[17px] font-bold tracking-tight mb-3">Recent tests</h2>

      {recentTests.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[15px] text-ink-2">
            No tests yet. Create one to get started.
          </p>
          <Link href="/admin/tests/new" className="btn-primary mt-4">
            Create your first test
          </Link>
        </div>
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead className="bg-canvas border-b border-line">
              <tr>
                <th className="th">Test</th>
                <th className="th">Status</th>
                <th className="th">Duration</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recentTests.map((t) => (
                <tr key={t.id} className="hover:bg-brand-50/40 transition">
                  <td className="td font-semibold text-ink">{t.title}</td>
                  <td className="td">
                    <Badge
                      tone={
                        t.status === "published"
                          ? "good"
                          : t.status === "closed"
                            ? "neutral"
                            : "warn"
                      }
                    >
                      {t.status}
                    </Badge>
                  </td>
                  <td className="td tabular-nums">{t.duration} min</td>
                  <td className="td text-right whitespace-nowrap">
                    <div className="flex gap-2 justify-end">
                      {t.status === "published" && (
                        <Link
                          href={`/admin/monitor/${t.id}`}
                          className="btn-ghost btn-sm"
                        >
                          Monitor
                        </Link>
                      )}
                      <Link
                        href={`/admin/tests/${t.id}`}
                        className="btn-ghost btn-sm"
                      >
                        Open
                      </Link>
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
