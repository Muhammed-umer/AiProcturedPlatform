"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/students", label: "Students" },
  // The live monitor is reached from a test, so it lights up Tests.
  { href: "/admin/tests", label: "Tests", also: ["/admin/monitor"] },
  { href: "/admin/results", label: "Results" },
  { href: "/admin/requests", label: "Reset requests" },
];

function isActive(pathname: string, href: string, also: string[] = []) {
  if (href === "/admin") return pathname === "/admin";
  return [href, ...also].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** The admin section tabs, with the current one underlined in brand yellow. */
export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Admin sections"
      className="flex gap-1 overflow-x-auto -mb-px pb-0"
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href, item.also);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap px-3 py-2.5 text-[14px] border-b-[3px] transition ${
              active
                ? "border-brand-500 font-semibold text-ink"
                : "border-transparent font-medium text-ink-2 hover:text-ink hover:border-brand-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
