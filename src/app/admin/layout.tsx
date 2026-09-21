import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/tests", label: "Tests" },
  { href: "/admin/results", label: "Results" },
  { href: "/admin/requests", label: "Reset requests" },
];

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
      <header className="shrink-0 z-40 bg-white border-b border-line">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Logo />
              <span className="hidden sm:inline chip bg-brand-100 text-brand-800">
                Admin
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

          <nav className="flex gap-1 overflow-x-auto -mb-px pb-0">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap px-3 py-2.5 text-[14px] font-medium text-ink-2
                           border-b-2 border-transparent hover:text-ink hover:border-brand-300
                           transition"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-7">
          {children}
        </div>
      </main>
    </div>
  );
}
