"use client";

import { useState } from "react";
import Link from "next/link";
import { updateTestGroups } from "@/app/actions/admin";
import { Alert } from "@/components/ui";

/**
 * Which groups may see this test. Editable at any time, including after the
 * test is published, which is how it gets opened up to an extra group later.
 */
export function GroupAssign({
  testId,
  allGroups,
  assignedIds,
  published,
}: {
  testId: string;
  allGroups: { id: string; name: string }[];
  assignedIds: string[];
  published: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(assignedIds);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const dirty =
    selected.length !== assignedIds.length ||
    selected.some((id) => !assignedIds.includes(id));

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[16px] mb-1">Available to</h2>
      <p className="text-[13.5px] text-ink-2 mb-4">
        {published
          ? "This test is live. Adding a group here makes it available to them immediately."
          : "Pick which groups will see this test."}
      </p>

      {allGroups.length === 0 ? (
        <Alert tone="warn">
          No groups exist yet.{" "}
          <Link href="/admin/groups" className="underline font-semibold">
            Create one first
          </Link>
          .
        </Alert>
      ) : (
        <form action={updateTestGroups} className="space-y-3">
          <input type="hidden" name="testId" value={testId} />

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {allGroups.map((g) => {
              const checked = selected.includes(g.id);
              return (
                <label
                  key={g.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition ${
                    checked
                      ? "border-brand-400 bg-brand-50"
                      : "border-line hover:border-brand-300 hover:bg-brand-50/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="groupIds"
                    value={g.id}
                    checked={checked}
                    onChange={() => toggle(g.id)}
                    className="h-4 w-4 accent-brand-500"
                  />
                  <span className="text-[14.5px] font-medium">{g.name}</span>
                </label>
              );
            })}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={!dirty}>
            {dirty ? "Save groups" : "Saved"}
          </button>
        </form>
      )}
    </div>
  );
}
