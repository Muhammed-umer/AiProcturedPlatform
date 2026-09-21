import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SEED_PASSWORD } from "@/lib/seed-accounts";

/**
 * Shows the demo sign-ins under the form so nobody has to go hunting for them
 * while working on the app. Development only: in production this renders
 * nothing at all, and it never touches the database.
 *
 * An account that has already been through the first-login password change is
 * listed as changed rather than shown with a password that no longer works.
 */
export async function DevCredentials() {
  if (process.env.NODE_ENV === "production") return null;

  let rows;
  try {
    rows = await db
      .select({
        rollNumber: users.rollNumber,
        name: users.name,
        role: users.role,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .orderBy(asc(users.role), asc(users.rollNumber));
  } catch {
    // No database yet. The sign-in form still works once there is one.
    return null;
  }

  if (rows.length === 0) return null;

  return (
    <div className="mt-6 rounded-xl border border-dashed border-line-2 bg-canvas p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="chip bg-amber-100 text-amber-800">Development</span>
        <span className="text-[12px] text-ink-3">
          Hidden in production builds
        </span>
      </div>

      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-3">
            <th className="pb-1.5 font-semibold">Roll number</th>
            <th className="pb-1.5 font-semibold">Password</th>
            <th className="pb-1.5 font-semibold">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((u) => (
            <tr key={u.rollNumber}>
              <td className="py-1.5 font-semibold tabular-nums">
                {u.rollNumber}
              </td>
              <td className="py-1.5 tabular-nums">
                {u.mustChangePassword ? (
                  SEED_PASSWORD
                ) : (
                  <span className="text-ink-3">changed</span>
                )}
              </td>
              <td className="py-1.5 text-ink-2 capitalize">{u.role}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[11.5px] text-ink-3 mt-2.5 leading-relaxed">
        First sign-in asks for a new password and a security question. Run{" "}
        <code className="font-mono">npm run db:seed</code> to put these back.
      </p>
    </div>
  );
}
