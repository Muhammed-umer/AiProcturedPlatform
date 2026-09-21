"use client";

import { useActionState } from "react";
import { importQuestions, type AdminState } from "@/app/actions/admin";
import { Alert } from "@/components/ui";

export function QuestionImport({ testId }: { testId: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(
    importQuestions,
    {},
  );

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-bold text-[16px]">Import questions</h2>
          <p className="text-[13.5px] text-ink-2 mt-0.5">
            Sections named in the sheet are created automatically.
          </p>
        </div>
        <a
          href="/api/templates/questions"
          className="btn-ghost btn-sm shrink-0"
        >
          Template
        </a>
      </div>

      <form action={action} className="space-y-3">
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {state.success && <Alert tone="success">{state.success}</Alert>}

        <input type="hidden" name="testId" value={testId} />

        <input
          name="file"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="input file:mr-3 file:rounded-md file:border-0 file:bg-brand-100
                     file:px-3 file:py-1.5 file:text-[13px] file:font-semibold
                     file:text-brand-800 cursor-pointer py-2"
          required
        />

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Importing…" : "Import from spreadsheet"}
        </button>
      </form>

      {state.issues && state.issues.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5">
          <h3 className="font-semibold text-[13.5px] text-amber-900 mb-1.5">
            {state.issues.length} row
            {state.issues.length === 1 ? "" : "s"} skipped
          </h3>
          <ul className="space-y-1 max-h-44 overflow-y-auto">
            {state.issues.map((issue, i) => (
              <li key={i} className="text-[13px] text-amber-900">
                <span className="font-semibold tabular-nums">
                  Row {issue.row}:
                </span>{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
