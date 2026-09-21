import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/ui";
import { StudentShell } from "./student-shell";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "student") redirect("/admin");
  if (session.mustChangePassword) redirect("/first-login");

  // StudentShell drops this entirely while a test is open.
  const header = (
    <header className="shrink-0 z-40 bg-white border-b border-line">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-right min-w-0 hidden sm:block">
            <div className="text-[13.5px] font-medium truncate max-w-[20ch]">
              {session.name}
            </div>
            <div className="text-[12px] text-ink-3 tabular-nums">
              {session.rollNumber}
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );

  return <StudentShell header={header}>{children}</StudentShell>;
}
