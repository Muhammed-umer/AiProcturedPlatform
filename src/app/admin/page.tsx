import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { sql, eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  groups,
  tests,
  attempts,
  passwordResetRequests,
} from "@/db/schema";
import {
  PageHeader,
  StatCard,
  StatusBadge,
  TableWrap,
  SectionTitle,
  EmptyState,
} from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

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

/** Published tests with someone writing them right now, busiest first. */
async function liveTests() {
  return db
    .select({
      id: tests.id,
      title: tests.title,
      writing: sql<number>`count(${attempts.id})::int`,
    })
    .from(tests)
    .innerJoin(attempts, eq(attempts.testId, tests.id))
    .where(and(eq(tests.status, "published"), eq(attempts.status, "in_progress")))
    .groupBy(tests.id, tests.title)
    .orderBy(desc(sql`count(${attempts.id})`))
    .limit(3);
}

/**
 * Drafts that cannot be published yet. Aliased, fully-qualified columns:
 * interpolated Drizzle columns render unqualified inside a raw subquery.
 */
async function unfinishedDrafts() {
  const rows = await db
    .select({
      id: tests.id,
      title: tests.title,
      questionCount: sql<number>`(
        select count(*)::int from questions q
        join sections s on s.id = q.section_id
        where s.test_id = tests.id
      )`,
      groupCount: sql<number>`(
        select count(*)::int from test_groups tg
        where tg.test_id = tests.id
      )`,
    })
    .from(tests)
    .where(eq(tests.status, "draft"))
    .orderBy(desc(tests.createdAt))
    .limit(20);
  return rows.filter((r) => r.questionCount === 0 || r.groupCount === 0);
}

// The lab server's clock may not be set to India, so the zone is explicit.
const ZONE = "Asia/Kolkata";

function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: ZONE,
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function AdminDashboard() {
  const session = await requireAdminPage();
  const [stats, live, drafts] = await Promise.all([
    counts(),
    liveTests(),
    unfinishedDrafts(),
  ]);

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

  const now = new Date();
  const today = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONE,
  });

  // Link text in this list stays generic on purpose: a test's own title is
  // shown beside the link, never inside it.
  const attention: { key: string; text: React.ReactNode; href: string; cta: string }[] = [];
  if (stats.resets > 0) {
    attention.push({
      key: "resets",
      text: (
        <>
          <strong className="text-ink tabular-nums">{stats.resets}</strong>{" "}
          password reset request{stats.resets === 1 ? " is" : "s are"} waiting.
        </>
      ),
      href: "/admin/requests",
      cta: "Review",
    });
  }
  for (const d of drafts.slice(0, 5)) {
    const needs =
      d.questionCount === 0 && d.groupCount === 0
        ? "has no questions and no group"
        : d.questionCount === 0
          ? "has no questions yet"
          : "is not assigned to a group";
    attention.push({
      key: d.id,
      text: (
        <>
          <strong className="text-ink">{d.title}</strong> {needs}.
        </>
      ),
      href: `/admin/tests/${d.id}`,
      cta: "Finish",
    });
  }

  return (
    <div className="fade-up">
      {/* The greeting band: the first thing seen after signing in. */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-white px-5 pt-5 sm:px-7 sm:pt-6">
        <div
          className="kolam kolam-fade pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
        <div className="relative">
          <p className="text-[13px] font-medium text-ink-3 mb-1">
            {greeting(now)}, {session.name} &middot; {today}
          </p>
          <PageHeader
            title="Dashboard"
            subtitle="An overview of students, tests and anything waiting on you."
            action={
              <Link href="/admin/tests/new" className="btn-primary">
                Create test
              </Link>
            }
          />
        </div>
      </div>

      {live.length > 0 && (
        <div className="mb-6 space-y-2">
          {live.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 sm:px-5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-800">
                    Live now
                  </div>
                  <div className="text-[15px] text-emerald-950 truncate">
                    <span className="font-semibold">{t.title}</span>
                    <span className="text-emerald-800 tabular-nums">
                      {" "}
                      &middot; {t.writing} writing
                    </span>
                  </div>
                </div>
              </div>
              <Link href={`/admin/monitor/${t.id}`} className="btn-primary btn-sm">
                Open monitor
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Labels avoid the nav's own words ("Students", "Tests") so each
          nav link keeps a unique accessible name. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatCard
          label="Student accounts"
          value={stats.students}
          href="/admin/students"
        />
        <StatCard label="Groups" value={stats.groups} href="/admin/groups" />
        <StatCard label="Test papers" value={stats.tests} href="/admin/tests" />
        <StatCard
          label="Writing now"
          value={stats.live}
          tone={stats.live > 0 ? "brand" : "default"}
          hint={stats.live > 0 ? "Open the live monitor" : undefined}
          href={live[0] ? `/admin/monitor/${live[0].id}` : "/admin/tests"}
        />
        <StatCard
          label="Reset requests"
          value={stats.resets}
          tone={stats.resets > 0 ? "bad" : "default"}
          hint={stats.resets > 0 ? "Waiting for you" : undefined}
          href="/admin/requests"
        />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="min-w-0">
          <SectionTitle>Recent tests</SectionTitle>

          {recentTests.length === 0 ? (
            <EmptyState
              title="No tests yet"
              message="Create one to get started: add sections and questions, assign a group, then publish."
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
                    <th className="th">Duration</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recentTests.map((t) => (
                    <tr key={t.id} className="hover:bg-brand-50/40 transition">
                      <td className="td font-semibold text-ink">{t.title}</td>
                      <td className="td">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="td tabular-nums whitespace-nowrap">
                        {t.duration} min
                      </td>
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

        <div>
          <SectionTitle>Needs attention</SectionTitle>
          <div className="card">
            {attention.length === 0 ? (
              <p className="px-5 py-6 text-[14px] text-ink-2 text-center">
                All clear. Nothing is waiting on you.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {attention.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <p className="text-[14px] text-ink-2 min-w-0">{item.text}</p>
                    <Link href={item.href} className="btn-ghost btn-sm shrink-0">
                      {item.cta}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
