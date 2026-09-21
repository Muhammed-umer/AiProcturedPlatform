"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getLiveSnapshot,
  forceSubmit,
  type LiveSnapshot,
  type LiveAttempt,
} from "@/app/actions/monitor";
import { StatCard, Badge, Tooltip } from "@/components/ui";

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const VIOLATION_LABEL: Record<string, string> = {
  tab_switch: "Switched tab",
  window_blur: "Lost focus",
  fullscreen_exit: "Left full screen",
  copy_paste: "Copy or paste",
  devtools: "Developer tools",
  print_screen: "Screenshot",
  no_face: "Face not visible",
  multiple_faces: "More than one person",
  looking_away: "Turned away from screen",
  camera_off: "Camera turned off",
};

export function MonitorView({
  testId,
  initial,
}: {
  testId: string;
  initial: LiveSnapshot;
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
  const inProgress = rows.filter((a) => a.status === "in_progress");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-7">
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
          {/* In-progress students first, as a live grid */}
          {inProgress.length > 0 && (
            <div className="mb-7">
              <h2 className="text-[15px] font-bold tracking-tight mb-3">
                In progress
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {inProgress.map((a) => {
                  const lowTime = a.remainingMs <= 60_000;
                  const pct =
                    a.totalQuestions > 0
                      ? Math.round(
                          (a.answeredCount / a.totalQuestions) * 100,
                        )
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
                          <ProctorThumb
                            attempt={a}
                            stamp={snapshot.serverNow}
                            size="card"
                          />
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
                          {clock(a.remainingMs)}
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
                          <Tooltip label="See this student's webcam and every moment the camera flagged.">
                            <Link
                              href={`/admin/monitor/${testId}/proctor/${a.attemptId}`}
                              className="btn-ghost btn-sm"
                            >
                              Camera{a.flagCount > 0 ? ` (${a.flagCount})` : ""}
                            </Link>
                          </Tooltip>
                          <Tooltip label="Finish this student's test now and mark it. They cannot go back in.">
                            <form action={forceSubmit}>
                              <input
                                type="hidden"
                                name="attemptId"
                                value={a.attemptId}
                              />
                              <button className="btn-ghost btn-sm" type="submit">
                                End
                              </button>
                            </form>
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
          <h2 className="text-[15px] font-bold tracking-tight mb-3">
            All attempts
          </h2>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
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
                  {rows.map((a) => (
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
                          className="flex items-center gap-2 group"
                          title="Open camera review"
                        >
                          <ProctorThumb
                            attempt={a}
                            stamp={snapshot.serverNow}
                            size="row"
                          />
                          {a.flagCount > 0 && (
                            <span className="text-[12px] font-semibold text-red-700 tabular-nums">
                              {a.flagCount} flagged
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="td tabular-nums">
                        {a.status === "in_progress" ? (
                          clock(a.remainingMs)
                        ) : (
                          <span className="text-ink-3">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The student's latest webcam frame. The `stamp` changes on every poll, which
 * busts the browser cache so the image refreshes with the rest of the page.
 */
function ProctorThumb({
  attempt,
  stamp,
  size,
}: {
  attempt: LiveAttempt;
  stamp: number;
  size: "card" | "row";
}) {
  const dims = size === "card" ? "h-14 w-[76px]" : "h-9 w-12";

  if (!attempt.hasSnapshot) {
    return (
      <div
        className={`${dims} shrink-0 rounded-md border border-dashed border-line-2 bg-canvas grid place-items-center text-[10px] leading-tight text-ink-3 text-center`}
      >
        No camera
      </div>
    );
  }

  const faceNote =
    attempt.faceCount === 0
      ? "No face"
      : attempt.faceCount !== null && attempt.faceCount > 1
        ? `${attempt.faceCount} faces`
        : null;

  return (
    <div className="relative shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic, auth-gated frame */}
      <img
        src={`/api/proctor/${attempt.attemptId}/latest?t=${stamp}`}
        alt={`Latest webcam frame for ${attempt.rollNumber}`}
        className={`${dims} rounded-md border border-line bg-ink object-cover`}
      />
      {faceNote && size === "card" && (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-red-600 px-1.5 text-[10px] font-bold text-white">
          {faceNote}
        </span>
      )}
    </div>
  );
}
