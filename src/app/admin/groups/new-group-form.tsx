"use client";

import { useActionState } from "react";
import { createGroup, type AdminState } from "@/app/actions/admin";
import { Alert } from "@/components/ui";

export function NewGroupForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(
    createGroup,
    {},
  );

  return (
    <div className="card p-5 lg:sticky lg:top-6">
      <h2 className="font-bold text-[16px] mb-1">New group</h2>
      <p className="text-[13.5px] text-ink-2 mb-4">
        Name it after the batch or section, for example CSE 2021 Batch.
      </p>

      <form action={action} className="space-y-3.5" key={state.success}>
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {state.success && <Alert tone="success">{state.success}</Alert>}

        <div>
          <label htmlFor="name" className="label">
            Group name
          </label>
          <input
            id="name"
            name="name"
            className="input"
            placeholder="CSE 2021 Batch"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="label">
            Description <span className="font-normal normal-case">(optional)</span>
          </label>
          <input
            id="description"
            name="description"
            className="input"
            placeholder="Final year, placement eligible"
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Creating…" : "Create group"}
        </button>
      </form>
    </div>
  );
}
