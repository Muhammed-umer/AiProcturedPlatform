"use client";

import { useState } from "react";
import type { Section } from "@/db/schema";
import { addSection, updateSection, deleteSection } from "@/app/actions/admin";
import { SubmitButton, ConfirmForm } from "@/components/ui";

/**
 * Sections carry the default marks for their questions and the topic label
 * used by the section-wise analysis.
 */
export function SectionEditor({
  testId,
  sections,
}: {
  testId: string;
  sections: Section[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-[16px]">Sections</h2>
          <p className="text-[13.5px] text-ink-2 mt-0.5">
            Each section sets the default marks for its questions.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm shrink-0"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Cancel" : "Add section"}
        </button>
      </div>

      {adding && (
        <form
          // Closed once the section is saved, so the button can show progress
          // and the new row is already in the list when the form goes.
          action={async (formData) => {
            await addSection(formData);
            setAdding(false);
          }}
          className="mb-4 rounded-lg border border-brand-300 bg-brand-50 p-4 grid sm:grid-cols-2 gap-3"
        >
          <input type="hidden" name="testId" value={testId} />
          <div>
            <label className="label">Section name</label>
            <input
              name="name"
              className="input"
              placeholder="Section B"
              required
            />
          </div>
          <div>
            <label className="label">Topic (for analysis)</label>
            <input name="topic" className="input" placeholder="Quantitative" />
          </div>
          <div>
            <label className="label">Marks per question</label>
            <input
              name="defaultMarks"
              type="number"
              step="0.5"
              min="0.5"
              defaultValue="1"
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">Negative marks</label>
            <input
              name="negativeMarks"
              type="number"
              step="0.25"
              min="0"
              defaultValue="0"
              className="input"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton className="btn-primary btn-sm" pendingText="Adding…">
              Add section
            </SubmitButton>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {sections.map((s) =>
          editingId === s.id ? (
            <form
              key={s.id}
              action={async (formData) => {
                await updateSection(formData);
                setEditingId(null);
              }}
              className="rounded-lg border border-brand-300 bg-brand-50 p-4 grid sm:grid-cols-2 gap-3"
            >
              <input type="hidden" name="testId" value={testId} />
              <input type="hidden" name="sectionId" value={s.id} />
              <div>
                <label className="label">Section name</label>
                <input
                  name="name"
                  className="input"
                  defaultValue={s.name}
                  required
                />
              </div>
              <div>
                <label className="label">Topic</label>
                <input
                  name="topic"
                  className="input"
                  defaultValue={s.topic ?? ""}
                />
              </div>
              <div>
                <label className="label">Marks per question</label>
                <input
                  name="defaultMarks"
                  type="number"
                  step="0.5"
                  min="0.5"
                  className="input"
                  defaultValue={Number(s.defaultMarks)}
                  required
                />
              </div>
              <div>
                <label className="label">Negative marks</label>
                <input
                  name="negativeMarks"
                  type="number"
                  step="0.25"
                  min="0"
                  className="input"
                  defaultValue={Number(s.negativeMarks)}
                  required
                />
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <SubmitButton className="btn-primary btn-sm" pendingText="Saving…">
                  Save
                </SubmitButton>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[15px]">
                  {s.name}
                  {s.topic && (
                    <span className="ml-2 text-[13px] font-normal text-ink-3">
                      {s.topic}
                    </span>
                  )}
                </div>
                <div className="text-[13px] text-ink-2 mt-0.5 tabular-nums">
                  {Number(s.defaultMarks)} mark
                  {Number(s.defaultMarks) === 1 ? "" : "s"} each
                  {Number(s.negativeMarks) > 0 &&
                    ` · −${Number(s.negativeMarks)} for a wrong answer`}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setEditingId(s.id)}
                >
                  Edit
                </button>
                {sections.length > 1 && (
                  <ConfirmForm
                    action={deleteSection}
                    confirm={`Delete the section "${s.name}" and every question in it?`}
                  >
                    <input type="hidden" name="testId" value={testId} />
                    <input type="hidden" name="sectionId" value={s.id} />
                    <SubmitButton
                      className="btn-danger btn-sm"
                      pendingText="Deleting…"
                    >
                      Delete
                    </SubmitButton>
                  </ConfirmForm>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
