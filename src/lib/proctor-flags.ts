/**
 * Decides when what the webcam sees becomes a warning.
 *
 * Face detection runs every few seconds in the student's browser and reports a
 * face count and, for a single face, whether it is turned away. A single odd
 * reading must not cost a warning: a student glances down to think, a hand
 * crosses the lens, the detector misses one frame. So a condition has to hold
 * continuously for a threshold before it is flagged, and it is flagged again
 * only after a longer repeat interval if it persists.
 *
 * Pure and time-agnostic: the caller passes the clock in, which is what makes
 * this testable without a camera.
 */

export type ProctorFlagType = "no_face" | "multiple_faces" | "looking_away";

/** Every camera-related violation type, including the one that needs no debounce. */
export type ProctorViolationType = ProctorFlagType | "camera_off";

export interface ProctorThresholds {
  /** Continuous milliseconds with no face before the first flag. */
  noFaceMs: number;
  /** Continuous milliseconds with two or more faces before the first flag. */
  multipleFacesMs: number;
  /** Continuous milliseconds turned away from the screen before the first flag. */
  lookingAwayMs: number;
  /** While a condition persists after a flag, flag again every this many ms. */
  repeatMs: number;
}

export const DEFAULT_THRESHOLDS: ProctorThresholds = {
  noFaceMs: 8_000,
  multipleFacesMs: 4_000,
  lookingAwayMs: 3_000,
  repeatMs: 30_000,
};

/** What the student is told when each flag fires. */
export const PROCTOR_MESSAGES: Record<ProctorViolationType, string> = {
  no_face: "Your face is not visible to the camera. Stay in front of it.",
  multiple_faces: "More than one person is visible to the camera.",
  looking_away: "You turned away from the screen. Keep facing the camera.",
  camera_off: "The camera was turned off or disconnected.",
};

/* ------------------------------------------------------------ head turn -- */

export interface FacePoint {
  x: number;
  y: number;
}

/**
 * How far the head is turned left or right, from the detector's face
 * keypoints. The model reports six, in this order: right eye, left eye, nose
 * tip, mouth, right ear, left ear.
 *
 * Facing the camera the nose sits midway between the ears, so the two
 * nose-to-ear distances match and this returns about 0. Turning the head moves
 * the nose towards one ear and the value towards 1. Dividing by the total
 * keeps it independent of how close the student is sitting.
 *
 * Returns null when there are not enough keypoints to judge.
 */
export function headTurn(keypoints: FacePoint[]): number | null {
  if (keypoints.length >= 6) {
    const [, , nose, , rightEar, leftEar] = keypoints;
    const toRight = Math.abs(nose.x - rightEar.x);
    const toLeft = Math.abs(nose.x - leftEar.x);
    const total = toRight + toLeft;
    if (total < 1e-6) return null;
    return (toLeft - toRight) / total;
  }

  // Fallback: the nose against the midpoint of the eyes.
  if (keypoints.length >= 3) {
    const [rightEye, leftEye, nose] = keypoints;
    const interEye = Math.abs(leftEye.x - rightEye.x);
    if (interEye < 1e-6) return null;
    return (nose.x - (rightEye.x + leftEye.x) / 2) / interEye;
  }

  return null;
}

/**
 * Past this much turn the student is treated as looking away. Deliberately
 * generous: glancing across a wide screen must not trigger it, and the three
 * second hold below filters the rest.
 */
export const HEAD_TURN_LIMIT = 0.4;

export function isLookingAway(
  keypoints: FacePoint[],
  limit: number = HEAD_TURN_LIMIT,
): boolean {
  const turn = headTurn(keypoints);
  return turn !== null && Math.abs(turn) > limit;
}

/* --------------------------------------------------------- the debounce -- */

interface Episode {
  /** When the condition started holding, or null while it does not hold. */
  since: number | null;
  /** When it was last flagged within this episode. */
  lastFlaggedAt: number | null;
}

export interface ProctorState {
  noFace: Episode;
  multipleFaces: Episode;
  lookingAway: Episode;
}

export function createProctorState(): ProctorState {
  return {
    noFace: { since: null, lastFlaggedAt: null },
    multipleFaces: { since: null, lastFlaggedAt: null },
    lookingAway: { since: null, lastFlaggedAt: null },
  };
}

function step(
  episode: Episode,
  active: boolean,
  now: number,
  firstMs: number,
  repeatMs: number,
): { episode: Episode; fired: boolean } {
  if (!active) {
    return { episode: { since: null, lastFlaggedAt: null }, fired: false };
  }

  const since = episode.since ?? now;
  const reference = episode.lastFlaggedAt ?? since;
  const wait = episode.lastFlaggedAt === null ? firstMs : repeatMs;

  if (now - reference >= wait) {
    return { episode: { since, lastFlaggedAt: now }, fired: true };
  }
  return {
    episode: { since, lastFlaggedAt: episode.lastFlaggedAt },
    fired: false,
  };
}

export interface FaceReading {
  faceCount: number;
  /** Whether the one visible face is turned away. Ignored unless exactly one. */
  lookingAway?: boolean;
}

/**
 * Feed one reading in. Returns the next state and any flags that fired on this
 * reading. A bare number is accepted as shorthand for a reading with no
 * head-turn information. The input state is not modified.
 */
export function observeFaces(
  state: ProctorState,
  reading: number | FaceReading,
  now: number,
  thresholds: ProctorThresholds = DEFAULT_THRESHOLDS,
): { state: ProctorState; flags: ProctorFlagType[] } {
  const { faceCount, lookingAway = false } =
    typeof reading === "number" ? { faceCount: reading } : reading;

  const noFace = step(
    state.noFace,
    faceCount === 0,
    now,
    thresholds.noFaceMs,
    thresholds.repeatMs,
  );
  const multiple = step(
    state.multipleFaces,
    faceCount >= 2,
    now,
    thresholds.multipleFacesMs,
    thresholds.repeatMs,
  );
  // Only meaningful for a single face: with nobody or several people in view,
  // the other two rules already describe what is wrong.
  const away = step(
    state.lookingAway,
    faceCount === 1 && lookingAway,
    now,
    thresholds.lookingAwayMs,
    thresholds.repeatMs,
  );

  const flags: ProctorFlagType[] = [];
  if (noFace.fired) flags.push("no_face");
  if (multiple.fired) flags.push("multiple_faces");
  if (away.fired) flags.push("looking_away");

  return {
    state: {
      noFace: noFace.episode,
      multipleFaces: multiple.episode,
      lookingAway: away.episode,
    },
    flags,
  };
}
