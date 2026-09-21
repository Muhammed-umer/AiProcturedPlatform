import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetRequests, users } from "@/db/schema";
import { PageHeader, TableWrap, EmptyState, Badge, Alert } from "@/components/ui";
import { resolveResetRequest } from "@/app/actions/admin";
import { generateDefaultPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

export default async function ResetRequestsPage() {
  const rows = await db
    .select({
      id: passwordResetRequests.id,
      status: passwordResetRequests.status,
      requestedAt: passwordResetRequests.requestedAt,
      userId: users.id,
      rollNumber: users.rollNumber,
      name: users.name,
    })
    .from(passwordResetRequests)
    .innerJoin(users, eq(users.id, passwordResetRequests.userId))
    .orderBy(desc(passwordResetRequests.requestedAt))
    .limit(100);

  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="fade-up">
      <PageHeader
        title="Password reset requests"
        subtitle="Students who could not answer their own security question. Approving one sets their password back to the default and forces them to choose a new one."
      />

      <div className="mb-5">
        <Alert tone="info">
          The lab server has no internet, so reset links cannot be emailed.
          Approve the request here, then read the student their default
          password in person.
        </Alert>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No requests"
          message="Students can reset their own password by answering their security question. This list only fills up when that fails."
        />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead className="bg-canvas border-b border-line">
              <tr>
                <th className="th">Roll number</th>
                <th className="th">Name</th>
                <th className="th">Requested</th>
                <th className="th">Status</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-brand-50/40 transition">
                  <td className="td font-semibold text-ink tabular-nums">
                    {r.rollNumber}
                  </td>
                  <td className="td text-ink">{r.name}</td>
                  <td className="td tabular-nums">
                    {r.requestedAt.toLocaleString()}
                  </td>
                  <td className="td">
                    <Badge
                      tone={
                        r.status === "pending"
                          ? "warn"
                          : r.status === "approved"
                            ? "good"
                            : "neutral"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="td text-right">
                    {r.status === "pending" ? (
                      <div className="flex gap-2 justify-end">
                        <form action={resolveResetRequest}>
                          <input type="hidden" name="requestId" value={r.id} />
                          <input type="hidden" name="userId" value={r.userId} />
                          <input
                            type="hidden"
                            name="rollNumber"
                            value={r.rollNumber}
                          />
                          <input
                            type="hidden"
                            name="decision"
                            value="approved"
                          />
                          <button className="btn-primary btn-sm" type="submit">
                            Reset to {generateDefaultPassword(r.rollNumber)}
                          </button>
                        </form>
                        <form action={resolveResetRequest}>
                          <input type="hidden" name="requestId" value={r.id} />
                          <input
                            type="hidden"
                            name="decision"
                            value="rejected"
                          />
                          <button className="btn-ghost btn-sm" type="submit">
                            Dismiss
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-ink-3 text-[13.5px]">Handled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {pending.length > 0 && (
        <p className="text-[13.5px] text-ink-3 mt-4">
          {pending.length} request{pending.length === 1 ? "" : "s"} waiting.
        </p>
      )}
    </div>
  );
}
