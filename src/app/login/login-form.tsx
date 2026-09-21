"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type ActionState } from "@/app/actions/auth";
import { Alert, Logo } from "@/components/ui";

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
      <div className="hidden lg:flex flex-col justify-between bg-brand-500 p-12">
        <Logo />
        <div>
          <h1 className="text-[44px] xl:text-[54px] font-bold leading-[1.05] tracking-tight text-ink max-w-[14ch]">
            Your department&rsquo;s own exam hall.
          </h1>
          <p className="text-[17px] text-brand-900 mt-5 max-w-[42ch] leading-relaxed">
            Timed, proctored placement tests that run entirely on the college
            network.
          </p>
        </div>
        <div className="text-[12.5px] text-brand-900/70">
          Hosted on the department server &middot; No internet required
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px] fade-up">
          <div className="lg:hidden mb-8">
            <Logo />
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

            <button type="submit" className="btn-primary w-full" disabled={pending}>
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
    </main>
  );
}
