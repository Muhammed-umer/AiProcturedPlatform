"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamPaper } from "@/app/actions/attempt";
import {
  saveAnswer,
  recordViolation,
  submitOwnAttempt,
  checkTime,
} from "@/app/actions/attempt";
import { ProctorCamera, type CameraStatus } from "./proctor-camera";

/** A student-facing reason the webcam could not be started. */
function cameraErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was refused. Allow the camera for this site in your browser and try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this computer. Please tell your invigilator.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is being used by another program. Close it and try again.";
  }
  if (err instanceof Error && err.message === "unsupported") {
    return "This browser cannot access the camera on this address. The test must be opened over HTTPS. Please tell your invigilator.";
  }
  return "The camera could not be started. Please tell your invigilator.";
}

type AnswerMap = Record<
  string,
  { selectedOptionIds: string[]; textAnswer: string }
>;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function ExamRunner({
  paper,
  faceGate = true,
}: {
  paper: ExamPaper;
  /** Require a visible face before the test can be started. */
  faceGate?: boolean;
}) {
  const router = useRouter();

  const [answers, setAnswers] = useState<AnswerMap>(paper.savedAnswers);
  const [current, setCurrent] = useState(0);
  const [remainingMs, setRemainingMs] = useState(paper.remainingMs);
  const [warnings, setWarnings] = useState(paper.warningCount);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [terminated, setTerminated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [needsFullscreen, setNeedsFullscreen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Separate from needsFullscreen: once the exam has begun the camera keeps
  // policing even if the student drops out of full screen.
  const [examStarted, setExamStarted] = useState(false);
  const [faceCount, setFaceCount] = useState<number | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("loading");
  const [agreed, setAgreed] = useState(false);

  // Guards against double submission from several triggers firing at once.
  const finishedRef = useRef(false);
  const warningsRef = useRef(paper.warningCount);
  const streamRef = useRef<MediaStream | null>(null);
  // Read inside the violation funnel, which must not re-create on every change.
  const examStartedRef = useRef(false);
  useEffect(() => {
    examStartedRef.current = examStarted;
  }, [examStarted]);

  const question = paper.questions[current];
  const total = paper.questions.length;

  /* ------------------------------------------------------------ camera -- */

  // Stopping the tracks ourselves does not fire the track's "ended" event, so
  // this never registers as a camera_off violation.
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  /* ------------------------------------------------------- submitting -- */

  const finish = useCallback(
    async (auto: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setSubmitting(true);

      try {
        await submitOwnAttempt(paper.attemptId);
      } catch {
        // The server may already have closed it, which is fine.
      }

      stopCamera();
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }

      router.replace(`/student/result/${paper.attemptId}${auto ? "?auto=1" : ""}`);
    },
    [paper.attemptId, router, stopCamera],
  );

  /* -------------------------------------------------------- violations -- */

  const flag = useCallback(
    async (type: string, message: string) => {
      if (finishedRef.current || terminated) return;
      // Nothing counts until the student has accepted the rules and begun.
      // Every detector funnels through here - the camera, tab switching,
      // losing focus, copy and paste - so this one guard covers them all.
      if (!examStartedRef.current) return;

      setWarningMessage(message);

      try {
        const res = await recordViolation(paper.attemptId, type, message);
        warningsRef.current = res.warningCount;
        setWarnings(res.warningCount);

        if (res.terminated) {
          setTerminated(true);
          finishedRef.current = true;
          stopCamera();
          setTimeout(() => {
            router.replace(`/student/result/${paper.attemptId}?terminated=1`);
          }, 2600);
        }
      } catch {
        // Offline. The warning still shows, and the count syncs on reconnect.
      }
    },
    [paper.attemptId, router, terminated, stopCamera],
  );

  /* -------------------------------------------------------- fullscreen -- */

  // Step one: turn the camera on. Needs a user gesture, and gives the student
  // a preview so they can sit in frame before anything is being judged.
  const enableCamera = useCallback(async () => {
    setStarting(true);
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = next;
      setStream(next);
    } catch (err) {
      setCameraError(cameraErrorMessage(err));
    } finally {
      setStarting(false);
    }
  }, []);

  // Step two: go full screen and begin. Only reachable once a face is visible,
  // so the clock never starts on a covered or unplugged camera.
  const startExam = useCallback(async () => {
    setStarting(true);
    try {
      await document.documentElement.requestFullscreen();
      setNeedsFullscreen(false);
      setExamStarted(true);
    } catch {
      // Some browsers refuse outside a user gesture. The prompt stays up.
    }
    setStarting(false);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setNeedsFullscreen(!active);
      if (!active && !finishedRef.current) {
        flag("fullscreen_exit", "You left full screen mode.");
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [flag]);

  /* ------------------------------------------------ tab switch & focus -- */

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && !finishedRef.current) {
        flag("tab_switch", "You switched away from the test.");
      }
    };
    const onBlur = () => {
      if (!finishedRef.current && !document.hidden) {
        flag("window_blur", "The test window lost focus.");
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [flag]);

  /* -------------------------------------------- copy, paste, shortcuts -- */

  useEffect(() => {
    document.body.classList.add("exam-locked");

    const block = (e: Event) => {
      e.preventDefault();
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      // Copy, cut, paste, select all, save, print, find, view source.
      if (mod && ["c", "x", "v", "a", "s", "p", "u", "f"].includes(k)) {
        e.preventDefault();
        flag("copy_paste", "Copying and pasting are disabled during the test.");
        return;
      }
      // Developer tools.
      if (
        e.key === "F12" ||
        (mod && e.shiftKey && ["i", "j", "c"].includes(k))
      ) {
        e.preventDefault();
        flag("devtools", "Developer tools are not allowed during the test.");
        return;
      }
      // Reload.
      if (e.key === "F5" || (mod && k === "r")) {
        e.preventDefault();
        return;
      }
      // Print screen cannot be blocked, but it can be recorded.
      if (e.key === "PrintScreen") {
        flag("print_screen", "Screenshots are not allowed during the test.");
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (finishedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.body.classList.remove("exam-locked");
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flag]);

  /* ------------------------------------------------------------ timer -- */

  useEffect(() => {
    const tick = setInterval(() => {
      setRemainingMs((ms) => {
        const next = ms - 1000;
        if (next <= 0 && !finishedRef.current) void finish(true);
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [finish]);

  // Resync with the server every 20 seconds, so a tampered clock gains nothing.
  useEffect(() => {
    const sync = setInterval(async () => {
      if (finishedRef.current) return;
      try {
        const res = await checkTime(paper.attemptId);
        setRemainingMs(res.remainingMs);
        if (res.status !== "in_progress" && !finishedRef.current) {
          finishedRef.current = true;
          router.replace(`/student/result/${paper.attemptId}?auto=1`);
        }
      } catch {
        // Offline. The local countdown keeps going and resyncs later.
      }
    }, 20_000);
    return () => clearInterval(sync);
  }, [paper.attemptId, router]);

  /* ---------------------------------------------------------- answers -- */

  const persist = useCallback(
    async (
      questionId: string,
      value: { selectedOptionIds: string[]; textAnswer: string },
    ) => {
      setSaving(true);
      try {
        const res = await saveAnswer(paper.attemptId, questionId, {
          selectedOptionIds: value.selectedOptionIds,
          textAnswer: value.textAnswer,
        });
        if (res.expired && !finishedRef.current) {
          finishedRef.current = true;
          router.replace(`/student/result/${paper.attemptId}?auto=1`);
        }
      } catch {
        // Kept locally, retried on the next change.
      } finally {
        setSaving(false);
      }
    },
    [paper.attemptId, router],
  );

  const setChoice = (optionId: string) => {
    if (!question) return;
    const prev = answers[question.id] ?? {
      selectedOptionIds: [],
      textAnswer: "",
    };

    const selected =
      question.type === "mcq_multiple"
        ? prev.selectedOptionIds.includes(optionId)
          ? prev.selectedOptionIds.filter((id) => id !== optionId)
          : [...prev.selectedOptionIds, optionId]
        : [optionId];

    const next = { selectedOptionIds: selected, textAnswer: "" };
    setAnswers((a) => ({ ...a, [question.id]: next }));
    void persist(question.id, next);
  };

  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setText = (value: string) => {
    if (!question) return;
    const next = { selectedOptionIds: [], textAnswer: value };
    setAnswers((a) => ({ ...a, [question.id]: next }));

    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => {
      void persist(question.id, next);
    }, 600);
  };

  const isAnswered = (id: string) => {
    const a = answers[id];
    if (!a) return false;
    return a.selectedOptionIds.length > 0 || a.textAnswer.trim().length > 0;
  };

  const answeredCount = paper.questions.filter((q) => isAnswered(q.id)).length;
  const lowTime = remainingMs <= 60_000;

  // Mounted on both the gate screen and the paper, so the camera keeps
  // watching even while the student is being asked to return to full screen.
  // Warnings and uploads only once the exam is genuinely running.
  const cameraActive = examStarted && !terminated && !submitting;

  const camera = stream ? (
    <ProctorCamera
      attemptId={paper.attemptId}
      stream={stream}
      active={cameraActive}
      variant={examStarted ? "corner" : "gate"}
      onViolation={flag}
      onFaceCount={setFaceCount}
      onStatus={setCameraStatus}
    />
  ) : null;

  // If the model could not load we cannot check the face, and blocking the
  // student out of their exam would be the worse failure.
  const faceCheckAvailable = faceGate && cameraStatus !== "no_model";
  const readyToStart =
    Boolean(stream) && (!faceCheckAvailable || faceCount === 1);

  /* ------------------------------------------------------------ views -- */

  if (terminated) {
    return (
      <div className="min-h-dvh grid place-items-center bg-red-50 p-6">
        <div className="max-w-[440px] text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-red-100 text-red-700 text-2xl font-bold">
            !
          </div>
          <h1 className="text-[24px] font-bold text-red-900">
            Your test has been submitted
          </h1>
          <p className="text-[15px] text-red-800 mt-2">
            The allowed number of warnings was reached. Please speak to your
            invigilator.
          </p>
        </div>
      </div>
    );
  }

  if (needsFullscreen) {
    // Mid-test: they dropped out of full screen and must return. The camera is
    // already running and still policing, so keep this short.
    if (examStarted) {
      return (
        <div className="min-h-dvh grid place-items-center bg-canvas p-6">
          <div className="card max-w-[460px] w-full p-7 text-center">
            <h1 className="text-[22px] font-bold tracking-tight">
              Return to full screen
            </h1>
            <p className="text-[15px] text-ink-2 mt-2 mb-6">
              Your test is still running and the clock is still going.
            </p>
            <button
              onClick={() => void startExam()}
              className="btn-primary w-full"
              disabled={starting}
            >
              {starting ? "Starting…" : "Back to full screen"}
            </button>
            {warnings > 0 && (
              <p className="text-[13.5px] text-red-700 mt-4 font-medium">
                Warnings used: {warnings} of {paper.maxWarnings}
              </p>
            )}
          </div>
          {camera}
        </div>
      );
    }

    // Before the test: camera first, then a face check, then start.
    const faceMessage = !faceCheckAvailable
      ? {
          tone: "warn" as const,
          text: "The face check is off on this computer. Your camera is still recording.",
        }
      : faceCount === null
        ? { tone: "wait" as const, text: "Starting the camera…" }
        : faceCount === 0
          ? {
              tone: "wait" as const,
              text: "Looking for your face. Sit in front of the camera in good light.",
            }
          : faceCount === 1
            ? { tone: "ok" as const, text: "Face detected. You can begin." }
            : {
                tone: "bad" as const,
                text: `${faceCount} people are visible. Only you may be in view.`,
              };

    const toneClass = {
      ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
      wait: "border-line bg-canvas text-ink-2",
      warn: "border-amber-200 bg-amber-50 text-amber-800",
      bad: "border-red-200 bg-red-50 text-red-800",
    }[faceMessage.tone];

    const cameraChecked = readyToStart;

    return (
      <div className="min-h-dvh bg-canvas py-8 px-4 sm:px-6">
        <div className="card max-w-[620px] w-full mx-auto p-6 sm:p-8">
          <h1 className="text-[24px] font-bold tracking-tight">
            Before you begin
          </h1>
          <p className="text-[14.5px] text-ink-2 mt-1.5">
            {paper.testTitle} &middot; {paper.questions.length} question
            {paper.questions.length === 1 ? "" : "s"} &middot;{" "}
            {Math.round(paper.remainingMs / 60000)} minutes
          </p>

          {/* -------------------------------------------------- the rules -- */}

          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3 mt-7 mb-2.5">
            Instructions
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-[14px] text-ink-2 leading-relaxed marker:text-brand-500">
            <li>
              The test runs in <strong className="text-ink">full screen</strong>{" "}
              for its whole duration. Leaving full screen is a warning.
            </li>
            <li>
              Your <strong className="text-ink">camera stays on</strong>. Keep
              your face visible and facing the screen.
            </li>
            <li>
              Turning away from the screen for more than{" "}
              <strong className="text-ink">3 seconds</strong> is a warning.
            </li>
            <li>
              You must be <strong className="text-ink">alone</strong>. Nobody
              else may appear in the camera view.
            </li>
            <li>
              Do not switch tabs or windows, and do not minimise the browser.
            </li>
            <li>Copying, pasting, right-click and printing are disabled.</li>
            <li>
              The timer runs on the server, so closing the browser does not
              pause it.
            </li>
            <li>
              Each breach is a warning.{" "}
              <strong className="text-ink">{paper.maxWarnings} warnings</strong>{" "}
              submit your test automatically.
            </li>
          </ul>

          {/* ---------------------------------------------- the checklist -- */}

          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3 mt-7 mb-2.5">
            Checklist
          </h2>

          {cameraError && (
            <div
              className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-800"
              role="alert"
            >
              {cameraError}
            </div>
          )}

          <div
            className={`rounded-xl border px-4 py-3.5 ${
              cameraChecked
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-line bg-canvas"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                  cameraChecked
                    ? "bg-emerald-500 text-white"
                    : "bg-white border border-line-2 text-ink-3"
                }`}
                aria-hidden="true"
              >
                {cameraChecked ? "✓" : "1"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">
                  Check your camera
                </div>
                <p className="text-[13px] text-ink-2 mt-0.5">
                  {stream
                    ? faceMessage.text
                    : "Turn the camera on and make sure you can see yourself clearly."}
                </p>

                {stream && (
                  <div className="mt-3 max-w-[240px]">
                    {camera}
                    <div
                      className={`mt-2 rounded-md border px-3 py-1.5 text-[12.5px] text-center ${toneClass}`}
                      role="status"
                      aria-live="polite"
                    >
                      {faceMessage.text}
                    </div>
                  </div>
                )}

                {!stream && (
                  <button
                    onClick={() => void enableCamera()}
                    className="btn-primary btn-sm mt-3"
                    disabled={starting}
                  >
                    {starting ? "Starting camera…" : "Turn on camera"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <label
            htmlFor="agree"
            className={`mt-3 flex items-start gap-3 rounded-xl border px-4 py-3.5 cursor-pointer transition ${
              agreed
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-line bg-canvas hover:border-brand-300"
            }`}
          >
            <input
              id="agree"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500 cursor-pointer"
            />
            <span className="text-[14px] font-semibold">
              I have read and agree to all the instructions above.
            </span>
          </label>

          {/* ------------------------------------------------- the button -- */}

          <button
            onClick={() => void startExam()}
            className="btn-primary w-full mt-5"
            disabled={starting || !cameraChecked || !agreed}
          >
            {starting
              ? "Starting…"
              : !stream
                ? "Turn on your camera first"
                : !cameraChecked
                  ? "Waiting for your face…"
                  : !agreed
                    ? "Agree to the instructions to continue"
                    : "Continue to the test"}
          </button>

          <p className="text-[12.5px] text-ink-3 mt-3 text-center">
            The timer and your warnings start only when you continue.
          </p>

          {warnings > 0 && (
            <p className="text-[13.5px] text-red-700 mt-3 font-medium text-center">
              Warnings used: {warnings} of {paper.maxWarnings}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-canvas">
      {/* Top bar, outside the scrolling area so it never moves */}
      <header className="shrink-0 z-30 bg-white border-b border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-bold text-[15px] truncate">
              {paper.testTitle}
            </div>
            <div className="text-[12px] text-ink-3 tabular-nums">
              {answeredCount} of {total} answered
              {saving && " · saving"}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {warnings > 0 && (
              <span className="chip bg-red-100 text-red-800">
                {warnings}/{paper.maxWarnings} warnings
              </span>
            )}
            <div
              className={`rounded-lg px-3 py-1.5 font-bold text-[17px] tabular-nums ${
                lowTime
                  ? "bg-red-100 text-red-800 animate-pulse"
                  : "bg-brand-100 text-brand-900"
              }`}
              role="timer"
              aria-live="off"
            >
              {formatClock(remainingMs)}
            </div>
            <button
              onClick={() => setConfirmOpen(true)}
              className="btn-primary btn-sm"
              disabled={submitting}
            >
              Submit
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 grid lg:grid-cols-[1fr_220px] gap-6 items-start">
        {/* Question */}
        <div className="card p-5 sm:p-7 min-w-0">
          {question ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="chip bg-brand-100 text-brand-800">
                  {question.sectionName}
                </span>
                <span className="chip bg-canvas text-ink-3 border border-line-2">
                  {question.marks} mark{question.marks === 1 ? "" : "s"}
                </span>
                {question.type === "mcq_multiple" && (
                  <span className="chip bg-amber-100 text-amber-800">
                    Select all that apply
                  </span>
                )}
              </div>

              <h2 className="text-[17px] sm:text-[19px] font-semibold leading-relaxed mb-6 whitespace-pre-wrap">
                <span className="text-ink-3 mr-2 tabular-nums">
                  {current + 1}.
                </span>
                {question.body}
              </h2>

              {question.type === "fill_blank" ? (
                <input
                  className="input max-w-md"
                  placeholder="Type your answer"
                  value={answers[question.id]?.textAnswer ?? ""}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              ) : (
                <div className="space-y-2.5">
                  {question.options.map((opt, i) => {
                    const selected =
                      answers[question.id]?.selectedOptionIds.includes(opt.id) ??
                      false;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setChoice(opt.id)}
                        className={`w-full flex items-start gap-3 rounded-lg border px-4 py-3.5 text-left transition ${
                          selected
                            ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                            : "border-line hover:border-brand-300 hover:bg-brand-50/40"
                        }`}
                      >
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center text-[12px] font-bold ${
                            question.type === "mcq_multiple"
                              ? "rounded-md"
                              : "rounded-full"
                          } ${
                            selected
                              ? "bg-brand-500 text-ink"
                              : "bg-canvas text-ink-3 border border-line-2"
                          }`}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="text-[15px] leading-relaxed min-w-0">
                          {opt.body}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 mt-8 pt-5 border-t border-line">
                <button
                  onClick={() => setCurrent((i) => Math.max(0, i - 1))}
                  className="btn-ghost"
                  disabled={current === 0}
                >
                  Previous
                </button>
                <button
                  onClick={() =>
                    setCurrent((i) => Math.min(total - 1, i + 1))
                  }
                  className="btn-primary"
                  disabled={current === total - 1}
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <p className="text-ink-2">This test has no questions.</p>
          )}
        </div>

        {/* Question palette */}
        <aside className="card p-4 lg:sticky lg:top-20">
          <h3 className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3 mb-3">
            Questions
          </h3>
          <div className="grid grid-cols-6 lg:grid-cols-5 gap-1.5">
            {paper.questions.map((q, i) => {
              const answered = isAnswered(q.id);
              const active = i === current;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrent(i)}
                  aria-label={`Question ${i + 1}${answered ? ", answered" : ""}`}
                  className={`h-8 rounded-md text-[12.5px] font-bold tabular-nums transition ${
                    active
                      ? "bg-ink text-white"
                      : answered
                        ? "bg-brand-400 text-ink"
                        : "bg-canvas text-ink-3 border border-line hover:border-brand-300"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-line space-y-1.5 text-[12px] text-ink-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-brand-400" /> Answered
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-canvas border border-line" />{" "}
              Not answered
            </div>
          </div>
        </aside>
        </div>
      </div>

      {camera}

      {/* Warning toast */}
      {warningMessage && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 p-4 flex justify-center"
          role="alert"
        >
          <div className="max-w-[520px] w-full rounded-xl border border-red-300 bg-red-50 shadow-lg p-4 flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-200 text-red-800 font-bold text-[13px]">
              !
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14.5px] text-red-900">
                Warning {warnings} of {paper.maxWarnings}
              </p>
              <p className="text-[13.5px] text-red-800 mt-0.5">
                {warningMessage}
              </p>
            </div>
            <button
              onClick={() => setWarningMessage(null)}
              className="text-red-700 hover:text-red-900 text-lg leading-none shrink-0 px-1"
              aria-label="Dismiss warning"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Submit confirmation */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6">
          <div className="card max-w-[420px] w-full p-6">
            <h2 className="text-[19px] font-bold tracking-tight">
              Submit your test?
            </h2>
            <p className="text-[14.5px] text-ink-2 mt-2">
              You have answered {answeredCount} of {total} questions.
              {answeredCount < total && (
                <>
                  {" "}
                  <span className="text-red-700 font-medium">
                    {total - answeredCount} unanswered.
                  </span>
                </>
              )}{" "}
              You cannot return once submitted.
            </p>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => void finish(false)}
                className="btn-primary flex-1"
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Yes, submit"}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className="btn-ghost"
                disabled={submitting}
              >
                Keep working
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
