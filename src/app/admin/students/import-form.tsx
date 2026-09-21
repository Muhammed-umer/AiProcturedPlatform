"use client";

import { useActionState, useState } from "react";
import { importStudents, type AdminState } from "@/app/actions/admin";
import { Alert } from "@/components/ui";

export function ImportForm({
  groups,
}: {
  groups: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(
    importStudents,
    {},
  );
  const [mode, setMode] = useState<"existing" | "new">(
    groups.length > 0 ? "existing" : "new",
  );

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-[16px]">Import students</h2>
          <p className="text-[13.5px] text-ink-2 mt-0.5 max-w-[54ch]">
            Upload a sheet with Roll Number, Name and Email. Accounts are created
            with a default password and added to the group you pick.
          </p>
        </div>
        <a href="/api/templates/students" className="btn-ghost btn-sm shrink-0">
          Download template
        </a>
      </div>

      <form action={action} className="space-y-4">
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {state.success && <Alert tone="success">{state.success}</Alert>}

        {/* Group choice: existing or brand new */}
        <div>
          <span className="label">Add these students to</span>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={() => setMode("existing")}
              disabled={groups.length === 0}
              className={
                mode === "existing"
                  ? "btn-primary btn-sm"
                  : "btn-ghost btn-sm disabled:opacity-40"
              }
            >
              An existing group
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={mode === "new" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
            >
              A new group
            </button>
          </div>

          <input type="hidden" name="groupMode" value={mode} />

          {mode === "existing" ? (
            <select
              name="groupId"
              className="input"
              required
              disabled={groups.length === 0}
              defaultValue=""
            >
              <option value="" disabled>
                Choose a group…
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="newGroupName"
              className="input"
              placeholder="Name for the new group, e.g. ECE 2022 Batch"
              required
            />
          )}
        </div>

        <div>
          <label htmlFor="file" className="label">
            Spreadsheet
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="input file:mr-3 file:rounded-md file:border-0 file:bg-brand-100
                       file:px-3 file:py-1.5 file:text-[13px] file:font-semibold
                       file:text-brand-800 cursor-pointer py-2"
            required
          />
        </div>

        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Importing…" : "Import students"}
        </button>
      </form>

      {/* Rows that could not be used */}
      {state.issues && state.issues.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h3 className="font-semibold text-[14px] text-amber-900 mb-2">
            {state.issues.length} row
            {state.issues.length === 1 ? " was" : "s were"} skipped
          </h3>
          <ul className="space-y-1 max-h-52 overflow-y-auto">
            {state.issues.map((issue, i) => (
              <li key={i} className="text-[13.5px] text-amber-900">
                <span className="font-semibold tabular-nums">
                  Row {issue.row}:
                </span>{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Issued credentials, shown once */}
      {state.credentials && state.credentials.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="font-semibold text-[14.5px]">
              Passwords to hand out
            </h3>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-ghost btn-sm"
            >
              Print
            </button>
          </div>
          <p className="text-[13px] text-ink-2 mb-3">
            These are shown only now. Students must change the password when they
            first sign in.
          </p>
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="overflow-x-auto max-h-72">
              <table className="w-full">
                <thead className="bg-canvas sticky top-0">
                  <tr>
                    <th className="th">Roll number</th>
                    <th className="th">Name</th>
                    <th className="th">Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {state.credentials.map((c) => (
                    <tr key={c.rollNumber}>
                      <td className="td font-semibold text-ink tabular-nums">
                        {c.rollNumber}
                      </td>
                      <td className="td">{c.name}</td>
                      <td className="td font-mono text-ink">{c.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
