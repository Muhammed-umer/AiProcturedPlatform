"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MadeByCredit } from "@/components/college";

/**
 * The student chrome. While a test is open the header is removed entirely:
 * the exam screen owns the whole viewport and must not offer a way out, so
 * the sign-out button and the rest of the navigation are not rendered at all
 * rather than merely hidden.
 */
export function StudentShell({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const inExam = pathname?.startsWith("/student/test/") ?? false;

  if (inExam) return <>{children}</>;

  return (
    // Exactly one viewport tall, and only the main area scrolls, so the
    // header cannot drift on a short page or during an overscroll bounce.
    <div className="h-dvh flex flex-col overflow-hidden">
      {header}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        {/* At least as tall as the scroll area, so on a short page the credit
            sits at the bottom of the screen rather than under the content. */}
        <div className="min-h-full flex flex-col">
          <div className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">
            {children}
          </div>
          <footer className="mx-auto w-full max-w-6xl px-4 sm:px-6 pb-6 pt-2 text-center">
            <MadeByCredit className="text-ink-3" />
          </footer>
        </div>
      </main>
    </div>
  );
}
