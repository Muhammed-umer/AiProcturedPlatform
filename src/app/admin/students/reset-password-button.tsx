"use client";

import { useActionState } from "react";
import {
  resetStudentPassword,
  resolveResetRequest,
  type ResetState,
} from "@/app/actions/admin";

/**
 * Shows the new temporary password exactly once, in place of the button.
 * Passwords are random now, so the admin must copy it down here.
 */
function IssuedPassword({ password }: { password: string }) {
  return (
    <div className="inline-flex flex-col items-end gap-0.5" role="status">
      <span className="font-mono text-[14px] font-bold tracking-wider text-ink bg-brand-100 border border-brand-300 rounded-md px-2 py-0.5 select-all">
        {password}
      </span>
      <span className="text-[11.5px] text-ink-3">
        Give this to the student. It is shown only once.
      </span>
    </div>
  );
}

export function ResetPasswordButton({
  userId,
  rollNumber,
}: {
  userId: string;
  rollNumber: string;
}) {
  const [state, action, pending] = useActionState<ResetState, FormData>(
    resetStudentPassword,
    {},
  );

  if (state.password) return <IssuedPassword password={state.password} />;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Reset the password for ${rollNumber}? They will be signed out and must set a new one.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button className="btn-ghost btn-sm" type="submit" disabled={pending}>
        {pending ? "Resetting…" : "Reset password"}
      </button>
      {state.error && (
        <p className="text-[12px] text-red-700 mt-1">{state.error}</p>
      )}
    </form>
  );
}

export function ResolveRequestButtons({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(
    resolveResetRequest,
    {},
  );

  if (state.password) return <IssuedPassword password={state.password} />;

  return (
    <form action={action} className="flex gap-2 justify-end">
      <input type="hidden" name="requestId" value={requestId} />
      <button
        className="btn-primary btn-sm"
        type="submit"
        name="decision"
        value="approved"
        disabled={pending}
      >
        {pending ? "Working…" : "Reset password"}
      </button>
      <button
        className="btn-ghost btn-sm"
        type="submit"
        name="decision"
        value="rejected"
        disabled={pending}
      >
        Dismiss
      </button>
      {state.error && (
        <p className="text-[12px] text-red-700 self-center">{state.error}</p>
      )}
    </form>
  );
}
