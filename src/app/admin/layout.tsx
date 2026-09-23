import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logoutAction } from "@/app/actions/auth";
import { Logo, Badge } from "@/components/ui";
import { MadeByCredit } from "@/components/college";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/student");
  if (session.mustChangePassword) redirect("/first-login");

  return (
    // The shell is exactly one viewport tall and does not scroll; only the
    // main area below does. That keeps the header still even on a short page,
    // where sticky positioning has nothing to stick to.
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* The 3px brand rule along the top is the portal's signature line. */}
      <header className="shrink-0 z-40 bg-white border-t-[3px] border-t-brand-500 border-b border-line">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Logo href="/admin" />
              <span className="hidden sm:inline-flex">
                <Badge tone="brand">Admin</Badge>
              </span>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <span className="hidden sm:block text-[13.5px] text-ink-2 truncate max-w-[18ch]">
                {session.name}
              </span>
              <form action={logoutAction}>
                <button type="submit" className="btn-ghost btn-sm">
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <AdminNav />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain">
        {/* At least as tall as the scroll area, so on a short page the credit
            sits at the bottom of the screen rather than under the content. */}
        <div className="min-h-full flex flex-col">
          <div className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-7">
            {children}
          </div>
          <footer className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-6 pt-2 text-center">
            <MadeByCredit className="text-ink-3" />
          </footer>
        </div>
      </main>
    </div>
  );
}
