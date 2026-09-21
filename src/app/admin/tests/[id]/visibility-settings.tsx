"use client";

import { useActionState } from "react";
import { updateTestVisibility, type AdminState } from "@/app/actions/admin";
import { Alert } from "@/components/ui";

/**
 * What a student is allowed to see about their own attempt once they submit.
 * Kept separate from the rest of the builder because it is a decision about
 * the drive, not about the paper.
 */
export function VisibilitySettings({
  testId,
  showScore,
  showAnswers,
}: {
  testId: string;
  showScore: boolean;
  showAnswers: boolean;
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(
    updateTestVisibility,
    {},
  );

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[16px] mb-1">After submitting</h2>
      <p className="text-[13.5px] text-ink-2 mb-4">
        What students see on their own result page.
      </p>

      <form action={action} className="space-y-3">
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {state.success && <Alert tone="success">{state.success}</Alert>}

        <input type="hidden" name="testId" value={testId} />

        <label
          htmlFor="showScore"
          className="flex items-start gap-3 cursor-pointer"
        >
          <input
            id="showScore"
            name="showScore"
            type="checkbox"
            defaultChecked={showScore}
            className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-brand-500 cursor-pointer"
          />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">
              Show their score
            </span>
            <span className="block text-[12.5px] text-ink-2">
              Marks, percentage and the section breakdown.
            </span>
          </span>
        </label>

        <label
          htmlFor="showAnswers"
          className="flex items-start gap-3 cursor-pointer"
        >
          <input
            id="showAnswers"
            name="showAnswers"
            type="checkbox"
            defaultChecked={showAnswers}
            className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-brand-500 cursor-pointer"
          />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">
              Show which answers were right
            </span>
            <span className="block text-[12.5px] text-ink-2">
              Question by question, with the correct answer. Turn this off if
              more than one batch sits this test, or the first batch can pass
              the answers on.
            </span>
          </span>
        </label>

        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
