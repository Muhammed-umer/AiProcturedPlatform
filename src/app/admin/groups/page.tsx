import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, groupMembers, testGroups } from "@/db/schema";
import { PageHeader, TableWrap, EmptyState, Badge } from "@/components/ui";
import { deleteGroup } from "@/app/actions/admin";
import { NewGroupForm } from "./new-group-form";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      // Columns are qualified with table aliases: this Drizzle version renders
      // interpolated columns unqualified inside a raw subquery, which makes a
      // shared name like "id" ambiguous against the correlated outer table.
      memberCount: sql<number>`(
        select count(*)::int from group_members gm
        where gm.group_id = groups.id
      )`,
      testCount: sql<number>`(
        select count(*)::int from test_groups tg
        where tg.group_id = groups.id
      )`,
    })
    .from(groups)
    .orderBy(groups.name);

  return (
    <div className="fade-up">
      <PageHeader
        title="Groups"
        subtitle="Groups decide who can see a test. A student can belong to more than one, and a test can be published to several."
      />

      <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
        <NewGroupForm />

        <div>
          {rows.length === 0 ? (
            <EmptyState
              title="No groups yet"
              message="Create a group such as CSE 2021 Batch, then import students into it."
            />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead className="bg-canvas border-b border-line">
                  <tr>
                    <th className="th">Group</th>
                    <th className="th">Students</th>
                    <th className="th">Tests</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((g) => (
                    <tr key={g.id} className="hover:bg-brand-50/40 transition">
                      <td className="td">
                        <div className="font-semibold text-ink">{g.name}</div>
                        {g.description && (
                          <div className="text-[13px] text-ink-3 mt-0.5">
                            {g.description}
                          </div>
                        )}
                      </td>
                      <td className="td tabular-nums">{g.memberCount}</td>
                      <td className="td">
                        {g.testCount > 0 ? (
                          <Badge tone="brand">{g.testCount} assigned</Badge>
                        ) : (
                          <span className="text-ink-3">&mdash;</span>
                        )}
                      </td>
                      <td className="td text-right">
                        <form action={deleteGroup}>
                          <input type="hidden" name="groupId" value={g.id} />
                          <button className="btn-danger btn-sm" type="submit">
                            Delete
                          </button>
                        </form>
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
