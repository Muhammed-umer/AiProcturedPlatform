"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  lookupSecurityQuestion,
  resetWithSecurityAnswer,
  requestAdminReset,
  type ActionState,
} from "@/app/actions/auth";
import { Alert, Logo } from "@/components/ui";

type LookupState = ActionState & { question?: string; rollNumber?: string };

export default function ForgotPasswordPage() {
  const [lookup, lookupAction, lookingUp] = useActionState<
    LookupState,
    FormData
  >(lookupSecurityQuestion, {});
  const [reset, resetAction, resetting] = useActionState<ActionState, FormData>(
    resetWithSecurityAnswer,
    {},
  );
  const [request, requestAction, requesting] = useActionState<
    ActionState,
    FormData
  >(requestAdminReset, {});

  const [showFallback, setShowFallback] = useState(false);

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-[440px] fade-up">
        <div className="mb-8">
          <Logo />
        </div>

        <div className="card p-6 sm:p-8">
          <h1 className="text-[24px] font-bold tracking-tight">
            Reset your password
          </h1>
          <p className="text-[14.5px] text-ink-2 mt-1.5 mb-6">
            Answer the security question you set when you first signed in.
          </p>

          {reset.success ? (
            <div className="space-y-5">
              <Alert tone="success">{reset.success}</Alert>
              <Link href="/login" className="btn-primary w-full">
                Go to sign in
              </Link>
            </div>
          ) : !lookup.question ? (
            /* Step 1: find the account */
            <form action={lookupAction} className="space-y-4">
              {lookup.error && <Alert tone="error">{lookup.error}</Alert>}
              <div>
                <label htmlFor="rollNumber" className="label">
                  Roll number
                </label>
                <input
                  id="rollNumber"
                  name="rollNumber"
                  className="input"
                  placeholder="e.g. 21CS045"
                  autoCapitalize="characters"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={lookingUp}
              >
                {lookingUp ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : (
            /* Step 2: answer and set a new password */
            <form action={resetAction} className="space-y-4">
              {reset.error && <Alert tone="error">{reset.error}</Alert>}

              <input type="hidden" name="rollNumber" value={lookup.rollNumber} />

              <div className="rounded-lg bg-brand-50 border border-brand-200 px-4 py-3">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-brand-700">
                  Your security question
                </div>
                <div className="text-[14.5px] font-medium mt-1">
                  {lookup.question}
                </div>
              </div>

              <div>
                <label htmlFor="securityAnswer" className="label">
                  Your answer
                </label>
                <input
                  id="securityAnswer"
                  name="securityAnswer"
                  className="input"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="password" className="label">
                  New password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div>
                <label htmlFor="confirm" className="label">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={resetting}
              >
                {resetting ? "Saving…" : "Reset password"}
              </button>
            </form>
          )}

          {/* Fallback: ask a staff member */}
          {!reset.success && (
            <div className="mt-6 pt-5 border-t border-line">
              {request.success ? (
                <Alert tone="success">{request.success}</Alert>
              ) : showFallback ? (
                <form action={requestAction} className="space-y-3">
                  <p className="text-[13.5px] text-ink-2">
                    A staff member will set a new password for you and hand it
                    over in person.
                  </p>
                  <input
                    name="rollNumber"
                    className="input"
                    placeholder="Your roll number"
                    defaultValue={lookup.rollNumber ?? ""}
                    required
                  />
                  <button
                    type="submit"
                    className="btn-ghost w-full"
                    disabled={requesting}
                  >
                    {requesting ? "Sending…" : "Send request to staff"}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowFallback(true)}
                  className="text-[13.5px] text-ink-2 hover:text-ink underline underline-offset-2"
                >
                  I cannot remember my security answer
                </button>
              )}
            </div>
          )}

          <div className="mt-5 text-center">
            <Link
              href="/login"
              className="text-[13.5px] text-ink-3 hover:text-ink"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
