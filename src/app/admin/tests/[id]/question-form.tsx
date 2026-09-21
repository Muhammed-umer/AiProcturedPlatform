"use client";

import { useActionState, useState } from "react";
import type { Section, QuestionType } from "@/db/schema";
import { addQuestion, type AdminState } from "@/app/actions/admin";
import { Alert } from "@/components/ui";

const TYPES: { value: QuestionType; label: string; hint: string }[] = [
  {
    value: "mcq_single",
    label: "One answer",
    hint: "Student picks a single option",
  },
  {
    value: "mcq_multiple",
    label: "Several answers",
    hint: "All correct options must be selected",
  },
  {
    value: "fill_blank",
    label: "Fill in the blank",
    hint: "Student types the answer",
  },
];

export function QuestionForm({
  testId,
  sections,
}: {
  testId: string;
  sections: Section[];
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(
    addQuestion,
    {},
  );
  const [type, setType] = useState<QuestionType>("mcq_single");
  const [optionCount, setOptionCount] = useState(4);
  // Closed by default: most visits to this page are to review or publish, not
  // to type a new question, and the open form pushed the question list down.
  const [open, setOpen] = useState(false);

  const isChoice = type !== "fill_blank";

  if (!open) {
    return (
      <div className="card p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-bold text-[16px]">Add a question</h2>
          <p className="text-[13.5px] text-ink-2 mt-0.5">
            Type one in by hand, or import a spreadsheet or document from the
            panel on the right.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-primary shrink-0"
        >
          Add a question
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="font-bold text-[16px] mb-1">Add a question</h2>
          <p className="text-[13.5px] text-ink-2">
            Pick the type first. The form changes to match it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-ghost btn-sm shrink-0"
        >
          Close
        </button>
      </div>

      <form action={action} className="space-y-4" key={state.success}>
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {state.success && <Alert tone="success">{state.success}</Alert>}

        <input type="hidden" name="testId" value={testId} />
        <input type="hidden" name="type" value={type} />

        {/* Question type */}
        <div>
          <span className="label">Question type</span>
          <div className="grid sm:grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`text-left rounded-lg border px-3.5 py-3 transition ${
                  type === t.value
                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                    : "border-line hover:border-brand-300 hover:bg-brand-50/40"
                }`}
              >
                <div className="font-semibold text-[14px]">{t.label}</div>
                <div className="text-[12.5px] text-ink-3 mt-0.5 leading-snug">
                  {t.hint}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-[1fr_150px] gap-4">
          <div>
            <label htmlFor="sectionId" className="label">
              Section
            </label>
            <select
              id="sectionId"
              name="sectionId"
              className="input"
              required
              defaultValue={sections[0]?.id}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({Number(s.defaultMarks)} mark
                  {Number(s.defaultMarks) === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="marksOverride" className="label">
              Marks
            </label>
            <input
              id="marksOverride"
              name="marksOverride"
              type="number"
              step="0.5"
              min="0.5"
              className="input"
              placeholder="Section default"
            />
          </div>
        </div>

        <div>
          <label htmlFor="body" className="label">
            Question
          </label>
          <textarea
            id="body"
            name="body"
            rows={3}
            className="input resize-y"
            placeholder={
              type === "fill_blank"
                ? "The chemical symbol for water is ______"
                : "What is the time complexity of binary search?"
            }
            required
          />
        </div>

        {isChoice ? (
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="label mb-0">
                Options &mdash; tick the correct{" "}
                {type === "mcq_multiple" ? "answers" : "answer"}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setOptionCount((n) => Math.max(2, n - 1))}
                  disabled={optionCount <= 2}
                >
                  &minus;
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setOptionCount((n) => Math.min(6, n + 1))}
                  disabled={optionCount >= 6}
                >
                  +
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {Array.from({ length: optionCount }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <input
                    type={type === "mcq_multiple" ? "checkbox" : "radio"}
                    name="correct"
                    value={i}
                    aria-label={`Option ${String.fromCharCode(65 + i)} is correct`}
                    className="h-4 w-4 accent-brand-500 shrink-0"
                  />
                  <span className="text-[13px] font-bold text-ink-3 w-4 shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    name={`option_${i}`}
                    className="input"
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    required={i < 2}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="acceptedAnswers" className="label">
              Accepted answers
            </label>
            <input
              id="acceptedAnswers"
              name="acceptedAnswers"
              className="input"
              placeholder="H2O | water"
              required
            />
            <p className="text-[12.5px] text-ink-3 mt-1.5">
              Separate alternative spellings with a vertical bar. Capitals and
              extra spaces are ignored when marking.
            </p>
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add question"}
        </button>
      </form>
    </div>
  );
}
