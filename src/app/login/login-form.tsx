"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type ActionState } from "@/app/actions/auth";
import { Alert } from "@/components/ui";
import {
  CollegeEmblem,
  CollegeMark,
  MadeByCredit,
  COLLEGE_SHORT,
  DEPARTMENT,
} from "@/components/college";

const initial: ActionState = {};

/**
 * The sign-in screen. `devPanel` is rendered under the form and carries the
 * development-only credential hint; it is empty in production.
 */
export function LoginForm({ devPanel }: { devPanel?: ReactNode }) {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <main className="min-h-dvh grid lg:grid-cols-2">
      {/* Brand panel, hidden on small screens where it would just push the form down */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-brand-500 p-12">
        {/* The emblem again, large and faint, as a watermark centred behind
            the copy. Sized to the panel so it is always shown whole. */}
        <div
          className="pointer-events-none select-none absolute inset-0 grid place-items-center p-12"
          aria-hidden="true"
        >
          <CollegeEmblem
            size={560}
            decorative
            className="h-auto max-h-full w-[72%] max-w-[560px] object-contain opacity-[0.08]"
          />
        </div>

        <div className="relative">
          <CollegeMark light size="lg" />
        </div>

        <div className="relative">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand-900/80 mb-4">
            {DEPARTMENT}
          </p>
          <h1 className="text-[44px] xl:text-[54px] font-bold leading-[1.05] tracking-tight text-ink max-w-[14ch]">
            Your campus&rsquo;s own exam hall.
          </h1>
          <p className="text-[17px] text-brand-900 mt-5 max-w-[44ch] leading-relaxed">
            Timed, camera-proctored placement tests for {COLLEGE_SHORT}{" "}
            students, running entirely on the college network.
          </p>
        </div>

        <div className="relative text-[12.5px] text-brand-900/70">
          Hosted on the department server &middot; No internet required
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col p-6 sm:p-10">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[400px] fade-up">
            <div className="lg:hidden mb-8">
              <CollegeMark />
            </div>

            <h2 className="text-[28px] font-bold tracking-tight">Sign in</h2>
            <p className="text-[15px] text-ink-2 mt-1.5 mb-7">
              Use the roll number and password issued by your department.
            </p>

            <form action={action} className="space-y-4">
              {state.error && <Alert tone="error">{state.error}</Alert>}

              <div>
                <label htmlFor="rollNumber" className="label">
                  Roll number
                </label>
                <input
                  id="rollNumber"
                  name="rollNumber"
                  className="input"
                  placeholder="e.g. 21CS045"
                  autoComplete="username"
                  autoCapitalize="characters"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="input"
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={pending}
              >
                {pending ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {devPanel}

            <div className="mt-6 pt-5 border-t border-line text-center">
              <Link
                href="/forgot-password"
                className="text-[14px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
          </div>
        </div>

        <footer className="pt-8 text-center">
          <MadeByCredit className="text-ink-3" />
        </footer>
      </div>
    </main>
  );
}
