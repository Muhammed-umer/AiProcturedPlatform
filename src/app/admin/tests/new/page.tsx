"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTest, type AdminState } from "@/app/actions/admin";
import { Alert, PageHeader } from "@/components/ui";

export default function NewTestPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<AdminState, FormData>(
    createTest,
    {},
  );

  // createTest returns the new test id in `success`.
  useEffect(() => {
    if (state.success) router.push(`/admin/tests/${state.success}`);
  }, [state.success, router]);

  return (
    <div className="fade-up max-w-[620px]">
      <PageHeader
        title="Create test"
        subtitle="Set the basics now. Sections and questions come next."
      />

      <div className="card p-5 sm:p-6">
        <form action={action} className="space-y-4">
          {state.error && <Alert tone="error">{state.error}</Alert>}

          <div>
            <label htmlFor="title" className="label">
              Test title
            </label>
            <input
              id="title"
              name="title"
              className="input"
              placeholder="Placement Aptitude Round 1"
              required
              autoFocus
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="durationMinutes" className="label">
                Duration in minutes
              </label>
              <input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={1}
                max={600}
                defaultValue={60}
                className="input"
                required
              />
            </div>

            <div>
              <label htmlFor="maxWarnings" className="label">
                Warnings before auto-submit
              </label>
              <input
                id="maxWarnings"
                name="maxWarnings"
                type="number"
                min={1}
                max={10}
                defaultValue={3}
                className="input"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="instructions" className="label">
              Instructions{" "}
              <span className="font-normal normal-case">(optional)</span>
            </label>
            <textarea
              id="instructions"
              name="instructions"
              rows={4}
              className="input resize-y"
              placeholder="Shown to the student before the timer starts."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Creating…" : "Create and add questions"}
            </button>
            <Link href="/admin/tests" className="btn-ghost">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
