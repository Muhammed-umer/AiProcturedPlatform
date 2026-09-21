"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceDetector } from "@mediapipe/tasks-vision";
import { uploadSnapshot } from "@/app/actions/proctor";
import {
  createProctorState,
  observeFaces,
  isLookingAway,
  PROCTOR_MESSAGES,
  type ProctorViolationType,
} from "@/lib/proctor-flags";

/**
 * Keeps the webcam running, counts faces on the student's own machine, and
 * sends small frames to the server: a live thumbnail every few seconds, and
 * one at the moment of each camera violation.
 *
 * Detection is done by a bundled MediaPipe model served from /proctor, so it
 * works on the lab network with no internet.
 *
 * `active` separates watching from policing. Before the test begins the camera
 * previews and counts faces so the student can position themselves, but
 * nothing is uploaded and no warning can be raised. Only once the exam is
 * actually running does a sustained problem become a violation.
 */

// Sampled every second so the three-second head-turn rule is judged accurately.
const DETECT_EVERY_MS = 1_000;
const LATEST_EVERY_MS = 15_000;
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
const JPEG_QUALITY = 0.5;

export type CameraStatus = "loading" | "watching" | "no_model";

/**
 * The TensorFlow Lite runtime inside MediaPipe announces itself with
 *   "INFO: Created TensorFlow Lite XNNPACK delegate for CPU."
 * and writes it through console.error, so Next's development overlay reports a
 * successful start-up as an error. Drop that one banner and nothing else, so a
 * real fault in the detector is still shown.
 */
let bannerSilenced = false;
function silenceTfliteBanner() {
  if (bannerSilenced || typeof window === "undefined") return;
  bannerSilenced = true;

  const banner = /^INFO: Created TensorFlow Lite XNNPACK delegate/;
  for (const level of ["error", "warn", "info", "log"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === "string" && banner.test(args[0])) return;
      original(...args);
    };
  }
}

export function ProctorCamera({
  attemptId,
  stream,
  active,
  variant = "corner",
  onViolation,
  onFaceCount,
  onStatus,
}: {
  attemptId: string;
  stream: MediaStream;
  /** True only while the exam is running: gates uploads and warnings. */
  active: boolean;
  /** "gate" is the larger preview on the start screen. */
  variant?: "corner" | "gate";
  onViolation: (type: ProctorViolationType, message: string) => void;
  onFaceCount?: (count: number) => void;
  onStatus?: (status: CameraStatus) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<CameraStatus>("loading");
  const [faces, setFaces] = useState<number | null>(null);
  const [away, setAway] = useState(false);

  // Latest values for the interval callbacks, without restarting them.
  const activeRef = useRef(active);
  const onViolationRef = useRef(onViolation);
  const onFaceCountRef = useRef(onFaceCount);
  const facesRef = useRef<number | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    onViolationRef.current = onViolation;
  }, [onViolation]);
  useEffect(() => {
    onFaceCountRef.current = onFaceCount;
  }, [onFaceCount]);
  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  /* --------------------------------------------------------- the stream -- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.play().catch(() => {
      // Autoplay of a muted local stream is allowed; a failure here is
      // transient and the next play() succeeds.
    });
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  // Unplugging the camera or revoking permission ends the track. Stopping it
  // ourselves at the end of the test does not fire this event.
  useEffect(() => {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const onEnded = () => {
      if (activeRef.current) {
        onViolationRef.current("camera_off", PROCTOR_MESSAGES.camera_off);
      }
    };
    track.addEventListener("ended", onEnded);
    return () => track.removeEventListener("ended", onEnded);
  }, [stream]);

  /* ------------------------------------------------------------ frames -- */

  const videoReady = useCallback(() => {
    const v = videoRef.current;
    return Boolean(v && v.readyState >= 2 && v.videoWidth > 0);
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !videoReady()) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    try {
      return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch {
      return null;
    }
  }, [videoReady]);

  const sendLatest = useCallback(() => {
    if (!activeRef.current) return false;
    const frame = captureFrame();
    if (!frame) return false;
    void uploadSnapshot(attemptId, frame, "latest", {
      faceCount: facesRef.current ?? undefined,
    }).catch(() => {
      // Offline. The next tick tries again.
    });
    return true;
  }, [attemptId, captureFrame]);

  /* ------------------------------------------- detection and uploading -- */

  useEffect(() => {
    let detector: FaceDetector | null = null;
    let cancelled = false;
    let state = createProctorState();

    (async () => {
      try {
        silenceTfliteBanner();
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(
          "/proctor/wasm",
        );
        const created = await vision.FaceDetector.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "/proctor/blaze_face_short_range.tflite",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });
        if (cancelled) {
          created.close();
          return;
        }
        detector = created;
        setStatus("watching");
      } catch {
        setStatus("no_model");
      }
    })();

    const detectTick = setInterval(() => {
      const video = videoRef.current;
      if (!detector || !video || !videoReady()) return;

      let count: number;
      let turnedAway = false;
      try {
        const found = detector.detectForVideo(
          video,
          performance.now(),
        ).detections;
        count = found.length;
        // Head turn is only meaningful for a single face; with nobody or
        // several people in view the other rules already say what is wrong.
        if (count === 1) {
          turnedAway = isLookingAway(found[0].keypoints ?? []);
        }
      } catch {
        return;
      }

      facesRef.current = count;
      setFaces(count);
      setAway(turnedAway);
      onFaceCountRef.current?.(count);

      // Watching only, until the exam is actually running. Any episode that
      // built up before the start is discarded, so the first warning can never
      // arrive from time the student spent on the start screen.
      if (!activeRef.current) {
        state = createProctorState();
        return;
      }

      const result = observeFaces(
        state,
        { faceCount: count, lookingAway: turnedAway },
        Date.now(),
      );
      state = result.state;

      for (const type of result.flags) {
        const frame = captureFrame();
        if (frame) {
          void uploadSnapshot(attemptId, frame, "flagged", {
            flagType: type,
            faceCount: count,
          }).catch(() => {});
        }
        onViolationRef.current(type, PROCTOR_MESSAGES[type]);
      }
    }, DETECT_EVERY_MS);

    // First thumbnail as soon as the exam starts and the video has frames,
    // then on a slow cadence.
    let firstSent = false;
    const warmup = setInterval(() => {
      if (firstSent) {
        clearInterval(warmup);
        return;
      }
      firstSent = sendLatest();
    }, 1_000);
    const latestTick = setInterval(sendLatest, LATEST_EVERY_MS);

    return () => {
      cancelled = true;
      clearInterval(detectTick);
      clearInterval(warmup);
      clearInterval(latestTick);
      detector?.close();
    };
  }, [attemptId, captureFrame, sendLatest, videoReady]);

  /* ------------------------------------------------------------- view -- */

  const mirrored = { transform: "scaleX(-1)" } as const;

  if (variant === "gate") {
    return (
      <div>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="w-full aspect-[4/3] rounded-lg border border-line bg-ink object-cover"
          style={mirrored}
        />
        <canvas ref={canvasRef} width={FRAME_WIDTH} height={FRAME_HEIGHT} hidden />
      </div>
    );
  }

  const faceNote =
    status !== "watching" || faces === null
      ? null
      : faces === 0
        ? "No face seen"
        : faces === 1
          ? away
            ? "Turned away"
            : "Face seen"
          : `${faces} faces seen`;

  return (
    <div
      className="fixed left-4 bottom-4 z-40 rounded-xl border border-line bg-white p-2 shadow-lg"
      aria-live="polite"
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="h-[72px] w-[96px] rounded-md bg-ink object-cover"
        style={mirrored}
      />
      <canvas ref={canvasRef} width={FRAME_WIDTH} height={FRAME_HEIGHT} hidden />
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            active ? "bg-red-500 animate-pulse" : "bg-ink-3"
          }`}
        />
        <span className="font-semibold">Camera on</span>
        <span className="text-ink-3">
          {status === "loading"
            ? "· starting"
            : status === "no_model"
              ? "· recording only"
              : faceNote
                ? `· ${faceNote}`
                : ""}
        </span>
      </div>
    </div>
  );
}
