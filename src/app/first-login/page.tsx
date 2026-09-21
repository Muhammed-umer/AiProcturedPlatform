"use client";

import { useActionState } from "react";
import { firstLoginAction, type ActionState } from "@/app/actions/auth";
import { Alert, Logo } from "@/components/ui";

const QUESTIONS = [
  "What was the name of your first school?",
  "What is your date of birth in DD-MM-YYYY?",
  "What is the name of your home town?",
  "What was your childhood nickname?",
];

const initial: ActionState = {};

export default function FirstLoginPage() {
  const [state, action, pending] = useActionState(firstLoginAction, initial);

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-[480px] fade-up">
        <div className="mb-8">
          <Logo />
        </div>

        <div className="card p-6 sm:p-8">
          <h1 className="text-[24px] font-bold tracking-tight">
            Set up your account
          </h1>
          <p className="text-[14.5px] text-ink-2 mt-1.5 mb-6">
            Choose your own password before your first test. The security
            question lets you reset it yourself later, without waiting for a
            staff member.
          </p>

          <form action={action} className="space-y-4">
            {state.error && <Alert tone="error">{state.error}</Alert>}

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
              <p className="text-[12.5px] text-ink-3 mt-1.5">
                At least 8 characters, including a letter and a number.
              </p>
            </div>

            <div>
              <label htmlFor="confirm" className="label">
                Confirm password
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

            <div className="pt-2 border-t border-line">
              <label htmlFor="securityQuestion" className="label mt-4">
                Security question
              </label>
              <select
                id="securityQuestion"
                name="securityQuestion"
                className="input"
                required
                defaultValue={QUESTIONS[0]}
              >
                {QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="securityAnswer" className="label">
                Your answer
              </label>
              <input
                id="securityAnswer"
                name="securityAnswer"
                className="input"
                placeholder="Remember this exactly"
                required
              />
              <p className="text-[12.5px] text-ink-3 mt-1.5">
                Capital letters and extra spaces are ignored when you answer.
              </p>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={pending}>
              {pending ? "Saving…" : "Save and continue"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
