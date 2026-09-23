import type { Section, Question, Option } from "@/db/schema";
import { Badge, EmptyState, ConfirmForm, SubmitButton } from "@/components/ui";
import { deleteQuestion } from "@/app/actions/admin";

const TYPE_LABEL: Record<string, string> = {
  mcq_single: "One answer",
  mcq_multiple: "Several answers",
  fill_blank: "Fill in the blank",
};

export function QuestionList({
  testId,
  sections,
  questions,
  options,
}: {
  testId: string;
  sections: Section[];
  questions: Question[];
  options: Option[];
}) {
  if (questions.length === 0) {
    return (
      <EmptyState
        title="No questions yet"
        message="Add one with the form above, or import a spreadsheet or a document."
      />
    );
  }

  return (
    <div className="space-y-5">
      {sections.map((section) => {
        const items = questions.filter((q) => q.sectionId === section.id);
        if (items.length === 0) return null;

        const sectionTotal = items.reduce(
          (sum, q) =>
            sum +
            (q.marksOverride !== null
              ? Number(q.marksOverride)
              : Number(section.defaultMarks)),
          0,
        );

        return (
          <div key={section.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 bg-canvas border-b border-line px-5 py-3">
              <h3 className="font-bold text-[15px]">
                {section.name}
                {section.topic && (
                  <span className="ml-2 text-[13px] font-normal text-ink-3">
                    {section.topic}
                  </span>
                )}
              </h3>
              <span className="text-[13px] text-ink-2 tabular-nums">
                {items.length} question{items.length === 1 ? "" : "s"} &middot;{" "}
                {sectionTotal} mark{sectionTotal === 1 ? "" : "s"}
              </span>
            </div>

            <ul className="divide-y divide-line">
              {items.map((q, index) => {
                const opts = options.filter((o) => o.questionId === q.id);
                const marks =
                  q.marksOverride !== null
                    ? Number(q.marksOverride)
                    : Number(section.defaultMarks);
                const overridden = q.marksOverride !== null;

                return (
                  <li key={q.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-ink-3 tabular-nums">
                          Q{index + 1}
                        </span>
                        <Badge tone="neutral">{TYPE_LABEL[q.type]}</Badge>
                        <Badge tone={overridden ? "brand" : "neutral"}>
                          {marks} mark{marks === 1 ? "" : "s"}
                          {overridden && " (custom)"}
                        </Badge>
                      </div>
                      <ConfirmForm
                        action={deleteQuestion}
                        confirm={`Delete question ${index + 1} of ${section.name}? This cannot be undone.`}
                        className="shrink-0"
                      >
                        <input type="hidden" name="testId" value={testId} />
                        <input type="hidden" name="questionId" value={q.id} />
                        <SubmitButton
                          className="btn-danger btn-sm"
                          pendingText="Deleting…"
                        >
                          Delete
                        </SubmitButton>
                      </ConfirmForm>
                    </div>

                    <p className="text-[15px] text-ink mb-3 whitespace-pre-wrap">
                      {q.body}
                    </p>

                    {q.type === "fill_blank" ? (
                      <div className="text-[13.5px]">
                        <span className="text-ink-3">Accepted: </span>
                        <span className="font-medium text-emerald-700">
                          {(q.acceptedAnswers ?? []).join(", ")}
                        </span>
                      </div>
                    ) : (
                      <ul className="grid sm:grid-cols-2 gap-1.5">
                        {opts.map((o, i) => (
                          <li
                            key={o.id}
                            className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-[14px] ${
                              o.isCorrect
                                ? "bg-emerald-50 text-emerald-900 font-medium"
                                : "text-ink-2"
                            }`}
                          >
                            <span className="font-bold text-[12.5px] mt-0.5 shrink-0">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="min-w-0">{o.body}</span>
                            {o.isCorrect && (
                              <span className="ml-auto text-emerald-600 shrink-0">
                                &#10003;
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
