import type { Metadata } from "next";
import { sql, eq } from "drizzle-orm";
import { requireAdminPage } from "@/lib/session";
import { db } from "@/db";
import { users, groups, groupMembers } from "@/db/schema";
import {
  PageHeader,
  TableWrap,
  Badge,
  EmptyState,
  SectionTitle,
} from "@/components/ui";
import { ResetPasswordButton } from "./reset-password-button";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Students" };

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  await requireAdminPage();
  const groupList = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .orderBy(groups.name);

  const students = await db
    .select({
      id: users.id,
      rollNumber: users.rollNumber,
      name: users.name,
      email: users.email,
      mustChangePassword: users.mustChangePassword,
      // Aliased, fully-qualified columns: interpolated Drizzle columns render
      // unqualified inside a raw subquery, making "id" ambiguous otherwise.
      groupNames: sql<string | null>`(
        select string_agg(g.name, ', ' order by g.name)
        from group_members gm
        join groups g on g.id = gm.group_id
        where gm.user_id = users.id
      )`,
    })
    .from(users)
    .where(eq(users.role, "student"))
    .orderBy(users.rollNumber)
    .limit(500);

  return (
    <div className="fade-up">
      <PageHeader
        title="Students"
        subtitle="Accounts are created from a spreadsheet. Roll numbers already in the system are not duplicated, they are just added to the chosen group."
      />

      <div className="mb-7">
        <ImportForm groups={groupList} />
      </div>

      <SectionTitle
        count={students.length}
        aside={
          students.length === 500 && (
            <span className="text-[12.5px] text-ink-3">Showing the first 500</span>
          )
        }
      >
        All students
      </SectionTitle>

      {students.length === 0 ? (
        <EmptyState
          title="No students yet"
          message="Upload a spreadsheet above to create student accounts."
        />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead className="bg-canvas border-b border-line">
              <tr>
                <th className="th">Roll number</th>
                <th className="th">Name</th>
                <th className="th">Groups</th>
                <th className="th">Status</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-brand-50/40 transition">
                  <td className="td font-semibold text-ink tabular-nums">
                    {s.rollNumber}
                  </td>
                  <td className="td">
                    <div className="text-ink">{s.name}</div>
                    {s.email && (
                      <div className="text-[12.5px] text-ink-3">{s.email}</div>
                    )}
                  </td>
                  <td className="td">
                    {s.groupNames ? (
                      <span className="text-[13.5px]">{s.groupNames}</span>
                    ) : (
                      <span className="text-ink-3">No group</span>
                    )}
                  </td>
                  <td className="td">
                    {s.mustChangePassword ? (
                      <Badge tone="warn">Default password</Badge>
                    ) : (
                      <Badge tone="good">Active</Badge>
                    )}
                  </td>
                  <td className="td text-right">
                    <ResetPasswordButton
                      userId={s.id}
                      rollNumber={s.rollNumber}
                    />
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
