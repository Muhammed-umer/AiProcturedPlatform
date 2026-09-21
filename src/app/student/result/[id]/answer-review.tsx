"use client";

import { useState } from "react";

export interface ReviewOption {
  id: string;
  body: string;
  isCorrect: boolean;
  chosen: boolean;
}

export interface ReviewQuestion {
  id: string;
  type: string;
  body: string;
  sectionName: string;
  explanation: string | null;
  acceptedAnswers: string[];
  textAnswer: string;
  isCorrect: boolean;
  attempted: boolean;
  awardedMarks: number;
  options: ReviewOption[];
}

type Filter = "all" | "correct" | "wrong" | "skipped";

/** Which bucket a question falls into. */
function verdict(q: ReviewQuestion): Exclude<Filter, "all"> {
  if (!q.attempted) return "skipped";
  return q.isCorrect ? "correct" : "wrong";
}

const TONE = {
  correct: {
    label: "Correct",
    stripe: "border-l-emerald-500",
    chip: "bg-emerald-100 text-emerald-800",
    tab: "bg-emerald-500 text-white",
  },
  wrong: {
    label: "Wrong",
    stripe: "border-l-red-500",
    chip: "bg-red-100 text-red-800",
    tab: "bg-red-500 text-white",
  },
  skipped: {
    label: "Not answered",
    stripe: "border-l-ink-3",
    chip: "bg-canvas text-ink-2 border border-line-2",
    tab: "bg-ink text-white",
  },
} as const;

/**
 * The student's paper after marking: what they chose, what was right, and
 * which questions they never reached.
 *
 * Questions keep their number from the paper whichever filter is on, so a
 * student comparing notes with a classmate is talking about the same Q4.
 */
export function AnswerReview({ review }: { review: ReviewQuestion[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = {
    all: review.length,
    correct: review.filter((q) => verdict(q) === "correct").length,
    wrong: review.filter((q) => verdict(q) === "wrong").length,
    skipped: review.filter((q) => verdict(q) === "skipped").length,
  };

  const attempted = counts.correct + counts.wrong;
  const shown = review
    .map((q, index) => ({ q, number: index + 1 }))
    .filter(({ q }) => filter === "all" || verdict(q) === filter);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "correct", label: "Correct", count: counts.correct },
    { key: "wrong", label: "Wrong", count: counts.wrong },
    { key: "skipped", label: "Not answered", count: counts.skipped },
  ];

  return (
    <>
      <h2 className="text-[17px] font-bold tracking-tight mt-8 mb-1">
        Your answers
      </h2>
      <p className="text-[13.5px] text-ink-2 mb-3">
        {counts.correct} of {counts.all} correct. You attempted {attempted} and
        left {counts.skipped} unanswered.
      </p>

      {/* Filter by how each question went. */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter questions">
        {tabs.map((t) => {
          const active = filter === t.key;
          const activeClass =
            t.key === "all" ? "bg-brand-500 text-ink" : TONE[t.key].tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              aria-pressed={active}
              disabled={t.count === 0 && t.key !== "all"}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                active
                  ? activeClass
                  : "bg-canvas text-ink-2 border border-line hover:border-brand-300"
              }`}
            >
              {t.label}
              <span className="ml-1.5 tabular-nums opacity-80">{t.count}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {shown.map(({ q, number }) => {
          const v = verdict(q);
          const tone = TONE[v];

          return (
            <div
              key={q.id}
              className={`card p-4 sm:p-5 border-l-4 ${tone.stripe}`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="chip bg-canvas text-ink-3 border border-line-2">
                  {q.sectionName}
                </span>
                <span className={`chip ${tone.chip}`}>{tone.label}</span>
                <span className="text-[12.5px] text-ink-3 tabular-nums ml-auto">
                  {q.awardedMarks} mark{q.awardedMarks === 1 ? "" : "s"}
                </span>
              </div>

              <p className="text-[15px] font-semibold leading-relaxed whitespace-pre-wrap">
                <span className="text-ink-3 mr-2 tabular-nums">{number}.</span>
                {q.body}
              </p>

              {q.type === "fill_blank" ? (
                <div className="mt-3 space-y-1.5 text-[14px]">
                  <div>
                    <span className="text-ink-3">You typed: </span>
                    {q.textAnswer.trim() ? (
                      <span
                        className={`font-semibold ${
                          q.isCorrect ? "text-emerald-800" : "text-red-800"
                        }`}
                      >
                        {q.textAnswer}
                      </span>
                    ) : (
                      <span className="text-ink-3 italic">nothing</span>
                    )}
                  </div>
                  {!q.isCorrect && q.acceptedAnswers.length > 0 && (
                    <div>
                      <span className="text-ink-3">Correct answer: </span>
                      <span className="font-semibold text-emerald-800">
                        {q.acceptedAnswers.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {q.options.map((o) => {
                    // Green is always the right answer. Red is only ever an
                    // option this student picked that was not.
                    const wrongPick = o.chosen && !o.isCorrect;
                    return (
                      <li
                        key={o.id}
                        className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-[14px] ${
                          o.isCorrect
                            ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                            : wrongPick
                              ? "bg-red-50 text-red-900 ring-1 ring-red-200"
                              : "text-ink-2"
                        }`}
                      >
                        <span className="shrink-0 font-bold w-4 text-center">
                          {o.isCorrect ? "✓" : wrongPick ? "✗" : "·"}
                        </span>
                        <span className="min-w-0">
                          {o.body}
                          {o.chosen && (
                            <span className="ml-2 text-[12px] font-semibold opacity-80">
                              your answer
                            </span>
                          )}
                          {o.isCorrect && !o.chosen && (
                            <span className="ml-2 text-[12px] font-semibold opacity-80">
                              correct answer
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {q.explanation && (
                <p className="mt-3 rounded-lg bg-canvas border border-line px-3 py-2 text-[13.5px] text-ink-2">
                  {q.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
