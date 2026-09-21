"use client";

import { useActionState, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  extractDocument,
  commitReviewedQuestions,
  type DocumentParseState,
  type CommitState,
} from "@/app/actions/document-import";
import type { AiParsedQuestion } from "@/lib/ai-parse";
import { Alert } from "@/components/ui";

const TYPE_LABEL: Record<string, string> = {
  mcq_single: "One answer",
  mcq_multiple: "Several answers",
  fill_blank: "Fill in the blank",
};

export function DocumentImport({ testId }: { testId: string }) {
  const router = useRouter();

  const [parseState, parseAction, parsing] = useActionState<
    DocumentParseState,
    FormData
  >(extractDocument, {});

  const [drafts, setDrafts] = useState<AiParsedQuestion[] | null>(null);

  // When extraction returns, load the drafts into editable local state.
  useEffect(() => {
    if (parseState.questions) setDrafts(parseState.questions);
  }, [parseState.questions]);

  if (drafts) {
    return (
      <ReviewScreen
        testId={testId}
        initial={drafts}
        fileName={parseState.fileName}
        onCancel={() => {
          setDrafts(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[16px] mb-1">Import from Word or PDF</h2>
      <p className="text-[13.5px] text-ink-2 mb-4">
        A question paper is read into draft questions for you to check before
        saving. This needs an internet connection.
      </p>

      <form action={parseAction} className="space-y-3">
        {parseState.error && <Alert tone="error">{parseState.error}</Alert>}

        <input type="hidden" name="testId" value={testId} />
        <input
          name="file"
          type="file"
          accept=".docx,.pdf"
          className="input file:mr-3 file:rounded-md file:border-0 file:bg-brand-100
                     file:px-3 file:py-1.5 file:text-[13px] file:font-semibold
                     file:text-brand-800 cursor-pointer py-2"
          required
        />

        <button type="submit" className="btn-primary w-full" disabled={parsing}>
          {parsing ? "Reading the document…" : "Read document"}
        </button>
      </form>

      <p className="text-[12px] text-ink-3 mt-3">
        Works best on clear text papers. Scanned images, heavy mathematics and
        diagram-based questions come through poorly, so check every question on
        the next screen.
      </p>
    </div>
  );
}

function ReviewScreen({
  testId,
  initial,
  fileName,
  onCancel,
}: {
  testId: string;
  initial: AiParsedQuestion[];
  fileName?: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<AiParsedQuestion[]>(initial);
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  const [commitState, commitAction, committing] = useActionState<
    CommitState,
    FormData
  >(commitReviewedQuestions, {});

  useEffect(() => {
    if (commitState.success) {
      const t = setTimeout(() => {
        onCancel();
        router.refresh();
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [commitState.success, onCancel, router]);

  const kept = questions.filter((_, i) => !dropped.has(i));
  const flaggedCount = kept.filter((q) => q.needsReview).length;

  const update = (index: number, patch: Partial<AiParsedQuestion>) => {
    setQuestions((qs) =>
      qs.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  };

  const updateOption = (
    qi: number,
    oi: number,
    patch: Partial<{ body: string; isCorrect: boolean }>,
  ) => {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qi) return q;
        const options = q.options.map((o, j) =>
          j === oi ? { ...o, ...patch } : o,
        );
        return { ...q, options };
      }),
    );
  };

  const toggleCorrect = (qi: number, oi: number) => {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qi) return q;
        const options = q.options.map((o, j) => {
          if (q.type === "mcq_single") {
            return { ...o, isCorrect: j === oi };
          }
          return j === oi ? { ...o, isCorrect: !o.isCorrect } : o;
        });
        return { ...q, options };
      }),
    );
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-[16px]">Review extracted questions</h2>
          <p className="text-[13.5px] text-ink-2 mt-0.5">
            {kept.length} to save from {fileName ?? "your document"}.
            {flaggedCount > 0 && (
              <span className="text-amber-700 font-medium">
                {" "}
                {flaggedCount} need a closer look.
              </span>
            )}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm">
          Discard all
        </button>
      </div>

      {commitState.error && (
        <div className="mb-4">
          <Alert tone="error">{commitState.error}</Alert>
        </div>
      )}
      {commitState.success && (
        <div className="mb-4">
          <Alert tone="success">{commitState.success}</Alert>
        </div>
      )}

      <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1 -mr-1">
        {questions.map((q, qi) => {
          const isDropped = dropped.has(qi);
          return (
            <div
              key={qi}
              className={`rounded-lg border p-4 ${
                isDropped
                  ? "border-line bg-canvas opacity-50"
                  : q.needsReview
                    ? "border-amber-300 bg-amber-50/50"
                    : "border-line bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-bold text-ink-3 tabular-nums">
                    {qi + 1}
                  </span>
                  <select
                    value={q.type}
                    onChange={(e) =>
                      update(qi, {
                        type: e.target.value as AiParsedQuestion["type"],
                      })
                    }
                    disabled={isDropped}
                    className="text-[12px] rounded border border-line-2 bg-white px-1.5 py-0.5"
                  >
                    {Object.entries(TYPE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  {q.needsReview && !isDropped && (
                    <span className="chip bg-amber-100 text-amber-800">
                      Check this
                    </span>
                  )}
                  <span className="text-[11px] text-ink-3">
                    {Math.round(q.confidence * 100)}% sure
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDropped((d) => {
                      const next = new Set(d);
                      if (next.has(qi)) next.delete(qi);
                      else next.add(qi);
                      return next;
                    })
                  }
                  className="text-[12px] font-medium text-ink-3 hover:text-ink underline"
                >
                  {isDropped ? "Keep" : "Remove"}
                </button>
              </div>

              {!isDropped && (
                <>
                  <textarea
                    value={q.body}
                    onChange={(e) => update(qi, { body: e.target.value })}
                    rows={2}
                    className="input text-[14px] resize-y mb-2"
                  />

                  {q.type === "fill_blank" ? (
                    <input
                      value={(q.acceptedAnswers ?? []).join(" | ")}
                      onChange={(e) =>
                        update(qi, {
                          acceptedAnswers: e.target.value
                            .split("|")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Accepted answers, separated by |"
                      className="input text-[13.5px]"
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {q.options.map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type={
                              q.type === "mcq_multiple" ? "checkbox" : "radio"
                            }
                            checked={o.isCorrect}
                            onChange={() => toggleCorrect(qi, oi)}
                            aria-label="Correct option"
                            className="h-4 w-4 accent-brand-500 shrink-0"
                          />
                          <input
                            value={o.body}
                            onChange={(e) =>
                              updateOption(qi, oi, { body: e.target.value })
                            }
                            className="input text-[13.5px] py-1.5"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <form action={commitAction} className="mt-4 pt-4 border-t border-line">
        <input type="hidden" name="testId" value={testId} />
        <input
          type="hidden"
          name="questions"
          value={JSON.stringify(kept)}
        />
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={committing || kept.length === 0}
        >
          {committing
            ? "Saving…"
            : `Save ${kept.length} question${kept.length === 1 ? "" : "s"}`}
        </button>
      </form>
    </div>
  );
}
