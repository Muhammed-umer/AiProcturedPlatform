"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { VIOLATION_LABEL, CAMERA_VIOLATIONS as CAMERA_TYPES } from "@/lib/violation-labels";
import {
  getLiveSnapshot,
  forceSubmit,
  type LiveSnapshot,
  type LiveAttempt,
} from "@/app/actions/monitor";
import {
  StatCard,
  Badge,
  Tooltip,
  TableWrap,
  SectionTitle,
  ConfirmForm,
} from "@/components/ui";

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type Filter = "all" | "warnings" | "ready";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "warnings", label: "Warnings" },
  { value: "ready", label: "Getting ready" },
];

/** Whether an attempt passes the chosen chip, before the text search. */
function inFilter(a: LiveAttempt, filter: Filter): boolean {
  if (filter === "warnings") return a.warningCount > 0;
  if (filter === "ready") return a.status === "in_progress" && !a.begun;
  return true;
}


export function MonitorView({
  testId,
  initial,
  cameraRequired = true,
}: {
  testId: string;
  initial: LiveSnapshot;
  /** Off for a test without camera proctoring: no thumbnails, no camera links. */
  cameraRequired?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot>(initial);
  const [live, setLive] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await getLiveSnapshot(testId);
      setSnapshot(next);
    } catch {
      // Transient. The next poll will recover.
    }
  }, [testId]);

  useEffect(() => {
    if (!live) return;
    const poll = setInterval(refresh, 5000);
    return () => clearInterval(poll);
  }, [live, refresh]);

  const rows = snapshot.attempts;

  // Search and filter only narrow what is drawn; polling is untouched.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const needle = query.trim().toLowerCase();
  const shown = rows.filter(
    (a) =>
      inFilter(a, filter) &&
      (!needle ||
        a.name.toLowerCase().includes(needle) ||
        a.rollNumber.toLowerCase().includes(needle)),
  );
  const inProgress = shown.filter((a) => a.status === "in_progress");
  const narrowed = filter !== "all" || needle !== "";

  const updatedAt = new Date(snapshot.serverNow).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              live ? "bg-emerald-500 animate-pulse" : "bg-ink-3"
            }`}
          />
          <span className="text-[13.5px] font-medium text-ink-2">
            {live
              ? "Live, refreshing every 5 seconds"
              : "Paused, this page is not updating"}
          </span>
          <span className="text-[12.5px] text-ink-3 tabular-nums">
            &middot; Last updated {updatedAt}
          </span>
          {!cameraRequired && <Badge tone="warn">Camera proctoring off</Badge>}
        </div>
        <div className="flex gap-2">
          <Tooltip label="Fetch the latest progress straight away, without waiting for the next refresh.">
            <button onClick={refresh} className="btn-ghost btn-sm">
              Refresh now
            </button>
          </Tooltip>
          <Tooltip
            label={
              live
                ? "Stop this page updating by itself. Nothing happens to the students or their tests, it only freezes what you see."
                : "Start updating this page again every 5 seconds."
            }
          >
            <button
              onClick={() => setLive((v) => !v)}
              className="btn-ghost btn-sm"
            >
              {live ? "Pause" : "Resume"}
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Writing now"
          value={snapshot.inProgress}
          tone={snapshot.inProgress > 0 ? "brand" : "default"}
        />
        <StatCard label="Submitted" value={snapshot.submitted} tone="good" />
        <StatCard label="Total attempts" value={rows.length} />
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[15px] text-ink-2">
            No students have started this test yet. This page updates on its own
            as they begin.
          </p>
        </div>
      ) : (
        <>
          {/* Narrowing the lists down, for a lab of a hundred */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <label htmlFor="monitor-search" className="sr-only">
              Search by name or roll number
            </label>
            <input
              id="monitor-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or roll number"
              className="input max-w-[280px] py-2 text-[14px]"
              autoComplete="off"
            />
            <div
              role="group"
              aria-label="Show"
              className="flex flex-wrap gap-1.5"
            >
              {FILTERS.map((f) => {
                const count = rows.filter((a) => inFilter(a, f.value)).length;
                const on = filter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(f.value)}
                    className={`chip border transition ${
                      on
                        ? "border-ink bg-ink text-white"
                        : "border-line-2 bg-white text-ink-2 hover:border-brand-300 hover:bg-brand-50"
                    }`}
                  >
                    {f.label}
                    <span
                      className={`tabular-nums ${on ? "text-white/70" : "text-ink-3"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            {narrowed && (
              <span className="text-[12.5px] text-ink-3 tabular-nums">
                Showing {shown.length} of {rows.length}
              </span>
            )}
          </div>

          {/* In-progress students first, as a live grid */}
          {inProgress.length > 0 && (
            <div className="mb-7">
              <SectionTitle count={inProgress.length}>In progress</SectionTitle>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {inProgress.map((a) => {
                  const lowTime = a.begun && a.remainingMs <= 60_000;
                  const pct =
                    a.totalQuestions > 0
                      ? Math.round((a.answeredCount / a.totalQuestions) * 100)
                      : 0;
                  return (
                    <div
                      key={a.attemptId}
                      className={`rounded-xl border p-4 ${
                        a.warningCount > 0
                          ? "border-red-200 bg-red-50/50"
                          : "border-line bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <div className="font-semibold text-[14.5px] truncate">
                              {a.name}
                            </div>
                            <div className="text-[12px] text-ink-3 tabular-nums">
                              {a.rollNumber}
                            </div>
                          </div>
                        </div>
                        <div
                          className={`rounded-md px-2 py-1 text-[13px] font-bold tabular-nums ${
                            lowTime
                              ? "bg-red-100 text-red-800"
                              : "bg-brand-100 text-brand-900"
                          }`}
                        >
                          {a.begun ? clock(a.remainingMs) : "Getting ready"}
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[12px] text-ink-2 mb-1">
                          <span>
                            {a.answeredCount}/{a.totalQuestions} answered
                          </span>
                          <span className="tabular-nums">{pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-canvas border border-line overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-3">
                        {a.warningCount > 0 ? (
                          <Badge tone="bad">
                            {a.warningCount} warning
                            {a.warningCount === 1 ? "" : "s"}
                          </Badge>
                        ) : (
                          <span className="text-[12px] text-ink-3">
                            No warnings
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Tooltip label="Every warning by name and time, and the photo taken as the test ends.">
                            <Link
                              href={`/admin/monitor/${testId}/proctor/${a.attemptId}`}
                              className="btn-ghost btn-sm"
                            >
                              Warnings
                              {a.cameraWarnings > 0
                                ? ` (${a.cameraWarnings} camera)`
                                : ""}
                            </Link>
                          </Tooltip>
                          <Tooltip label="Finish this student's test now and mark it. They cannot go back in.">
                            <ConfirmForm
                              action={forceSubmit}
                              confirm={`End the test for ${a.name} (${a.rollNumber}) now? It is submitted and marked as it stands, and they cannot go back in.`}
                            >
                              <input
                                type="hidden"
                                name="attemptId"
                                value={a.attemptId}
                              />
                              <button
                                className="btn-danger btn-sm"
                                type="submit"
                              >
                                End
                              </button>
                            </ConfirmForm>
                          </Tooltip>
                        </div>
                      </div>

                      {a.lastViolation && (
                        <div className="mt-2 text-[11.5px] text-red-700">
                          Last:{" "}
                          {VIOLATION_LABEL[a.lastViolation] ?? a.lastViolation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full table of everyone */}
          <SectionTitle count={shown.length}>All attempts</SectionTitle>
          {shown.length === 0 ? (
            <div className="card p-8 text-center text-[14.5px] text-ink-2">
              No students match. Clear the search or choose All.
            </div>
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead className="bg-canvas border-b border-line">
                  <tr>
                    <th className="th">Roll number</th>
                    <th className="th">Name</th>
                    <th className="th">Status</th>
                    <th className="th">Progress</th>
                    <th className="th">Warnings</th>
                    <th className="th">Camera</th>
                    <th className="th">Time left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((a) => (
                    <tr key={a.attemptId}>
                      <td className="td font-semibold text-ink tabular-nums">
                        {a.rollNumber}
                      </td>
                      <td className="td text-ink">{a.name}</td>
                      <td className="td">
                        {a.status === "in_progress" ? (
                          <Badge tone="brand">Writing</Badge>
                        ) : a.status === "terminated" ? (
                          <Badge tone="bad">Ended early</Badge>
                        ) : a.status === "auto_submitted" ? (
                          <Badge tone="warn">Timed out</Badge>
                        ) : (
                          <Badge tone="good">Submitted</Badge>
                        )}
                      </td>
                      <td className="td tabular-nums">
                        {a.answeredCount}/{a.totalQuestions}
                      </td>
                      <td className="td">
                        {a.warningCount > 0 ? (
                          <span className="text-red-700 font-semibold tabular-nums">
                            {a.warningCount}
                          </span>
                        ) : (
                          <span className="text-ink-3">&mdash;</span>
                        )}
                      </td>
                      <td className="td">
                        <Link
                          href={`/admin/monitor/${testId}/proctor/${a.attemptId}`}
                          className="inline-flex flex-col gap-0.5 rounded text-[13px] hover:underline"
                          title="Open the warnings review"
                        >
                          {!cameraRequired ? (
                            <span className="text-ink-3">Camera off</span>
                          ) : a.lastViolation &&
                            CAMERA_TYPES.has(a.lastViolation) ? (
                            <span className="font-semibold text-red-700">
                              {VIOLATION_LABEL[a.lastViolation]}
                            </span>
                          ) : a.cameraWarnings > 0 ? (
                            <span className="text-red-700">
                              {a.cameraWarnings} camera warning
                              {a.cameraWarnings === 1 ? "" : "s"}
                            </span>
                          ) : (
                            <span className="text-ink-2">Clear</span>
                          )}
                          {a.status !== "in_progress" && (
                            <span className="text-[12px] text-ink-3">
                              {a.hasPhoto ? "Photo received" : "No photo"}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="td tabular-nums">
                        {a.status === "in_progress" ? (
                          a.begun ? (
                            clock(a.remainingMs)
                          ) : (
                            <span className="text-ink-3">Getting ready</span>
                          )
                        ) : (
                          <span className="text-ink-3">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}
    </div>
  );
}
