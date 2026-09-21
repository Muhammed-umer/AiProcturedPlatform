import { describe, it, expect } from "vitest";
import {
  createProctorState,
  observeFaces,
  headTurn,
  isLookingAway,
  HEAD_TURN_LIMIT,
  DEFAULT_THRESHOLDS,
  PROCTOR_MESSAGES,
  type ProctorState,
  type ProctorFlagType,
  type FaceReading,
} from "../proctor-flags";

/**
 * The six keypoints the detector reports, in its order: right eye, left eye,
 * nose, mouth, right ear, left ear. `noseX` slides the nose between the ears,
 * which is what turning the head does in the image.
 */
function face(noseX: number) {
  return [
    { x: 0.42, y: 0.4 },
    { x: 0.58, y: 0.4 },
    { x: noseX, y: 0.5 },
    { x: noseX, y: 0.6 },
    { x: 0.3, y: 0.45 },
    { x: 0.7, y: 0.45 },
  ];
}

/** Feeds a sequence of readings spaced `stepMs` apart, collecting every flag. */
function run(
  readings: (number | FaceReading)[],
  stepMs: number,
  start = 0,
): { state: ProctorState; flags: ProctorFlagType[][] } {
  let state = createProctorState();
  const flags: ProctorFlagType[][] = [];
  readings.forEach((count, i) => {
    const out = observeFaces(state, count, start + i * stepMs);
    state = out.state;
    flags.push(out.flags);
  });
  return { state, flags };
}

describe("observeFaces: no face", () => {
  it("does not flag a short absence", () => {
    // 0, 3s, 6s of no face: all under the 8s threshold.
    const { flags } = run([0, 0, 0], 3000);
    expect(flags.flat()).toEqual([]);
  });

  it("flags once when the absence reaches the threshold", () => {
    // 0, 3, 6, 9 seconds.
    const { flags } = run([0, 0, 0, 0], 3000);
    expect(flags).toEqual([[], [], [], ["no_face"]]);
  });

  it("does not flag again on the very next reading", () => {
    const { flags } = run([0, 0, 0, 0, 0], 3000);
    expect(flags.flat()).toEqual(["no_face"]);
  });

  it("flags again only after the repeat interval while it persists", () => {
    // Readings every 3s for 45s. First flag at 9s; repeat at 9 + 30 = 39s.
    const readings = Array.from({ length: 16 }, () => 0);
    const { flags } = run(readings, 3000);
    const firedAt = flags
      .map((f, i) => (f.length ? i * 3000 : null))
      .filter((t): t is number => t !== null);
    expect(firedAt).toEqual([9000, 39000]);
  });

  it("resets when the face comes back, so a later absence starts fresh", () => {
    // 6s absent (no flag), face returns, then 6s absent again: still no flag.
    const { flags } = run([0, 0, 0, 1, 0, 0, 0], 3000);
    expect(flags.flat()).toEqual([]);
  });

  it("never flags while exactly one face is visible", () => {
    const { flags } = run(Array.from({ length: 20 }, () => 1), 3000);
    expect(flags.flat()).toEqual([]);
  });
});

describe("observeFaces: multiple faces", () => {
  it("uses its own, shorter threshold", () => {
    // 0, 3, 6 seconds with two faces: fires at 6s (threshold 4s).
    const { flags } = run([2, 2, 2], 3000);
    expect(flags).toEqual([[], [], ["multiple_faces"]]);
  });

  it("is independent of the no-face episode", () => {
    // Two faces briefly, then nobody. Neither reaches its threshold.
    const { flags } = run([2, 0, 0], 3000);
    expect(flags.flat()).toEqual([]);
  });
});

describe("observeFaces: contract", () => {
  it("does not modify the input state", () => {
    const state = createProctorState();
    const copy = JSON.parse(JSON.stringify(state));
    observeFaces(state, 0, 0);
    observeFaces(state, 0, 10_000);
    expect(state).toEqual(copy);
  });

  it("respects custom thresholds", () => {
    let state = createProctorState();
    const t = {
      noFaceMs: 1000,
      multipleFacesMs: 1000,
      lookingAwayMs: 1000,
      repeatMs: 5000,
    };
    expect(observeFaces(state, 0, 0, t).flags).toEqual([]);
    state = observeFaces(state, 0, 0, t).state;
    expect(observeFaces(state, 0, 1000, t).flags).toEqual(["no_face"]);
  });

  it("ships sensible defaults and a message for every violation type", () => {
    expect(DEFAULT_THRESHOLDS.noFaceMs).toBeGreaterThan(
      DEFAULT_THRESHOLDS.multipleFacesMs,
    );
    expect(DEFAULT_THRESHOLDS.repeatMs).toBeGreaterThan(
      DEFAULT_THRESHOLDS.noFaceMs,
    );
    for (const key of ["no_face", "multiple_faces", "camera_off"] as const) {
      expect(PROCTOR_MESSAGES[key].length).toBeGreaterThan(10);
    }
  });
});


describe("headTurn", () => {
  it("reads about zero when the nose sits midway between the ears", () => {
    expect(Math.abs(headTurn(face(0.5))!)).toBeLessThan(0.01);
  });

  it("grows towards 1 as the head turns, and is symmetric either way", () => {
    const oneWay = headTurn(face(0.35))!;
    const other = headTurn(face(0.65))!;
    // The sign says which way; turning the opposite way must mirror it.
    expect(Math.sign(oneWay)).toBe(-Math.sign(other));
    expect(Math.abs(oneWay)).toBeCloseTo(Math.abs(other), 5);
    // Further round still means a larger reading.
    expect(Math.abs(headTurn(face(0.32))!)).toBeGreaterThan(Math.abs(oneWay));
    expect(Math.abs(oneWay)).toBeLessThanOrEqual(1);
  });

  it("measures the nose against the student's own ears, so sitting off to " +
    "one side of the frame is not a turn", () => {
    // The whole face shifted right in frame, head still facing the camera.
    const shifted = face(0.5).map((p) => ({ ...p, x: p.x + 0.15 }));
    expect(Math.abs(headTurn(shifted)!)).toBeLessThan(0.01);
    expect(isLookingAway(shifted)).toBe(false);
  });

  it("returns null when there are too few keypoints to judge", () => {
    expect(headTurn([])).toBeNull();
    expect(headTurn([{ x: 0.5, y: 0.5 }])).toBeNull();
  });

  it("falls back to the eyes when ears are missing", () => {
    const eyesOnly = face(0.5).slice(0, 3);
    expect(headTurn(eyesOnly)).not.toBeNull();
    expect(Math.abs(headTurn(eyesOnly)!)).toBeLessThan(0.01);
  });
});

describe("isLookingAway", () => {
  it("accepts facing the camera and a small glance", () => {
    expect(isLookingAway(face(0.5))).toBe(false);
    expect(isLookingAway(face(0.46))).toBe(false);
  });

  it("rejects a clear turn either way", () => {
    expect(isLookingAway(face(0.28))).toBe(true);
    expect(isLookingAway(face(0.72))).toBe(true);
  });

  it("uses the documented limit", () => {
    expect(HEAD_TURN_LIMIT).toBeGreaterThan(0);
    expect(HEAD_TURN_LIMIT).toBeLessThan(1);
  });
});

describe("observeFaces: looking away", () => {
  const away: FaceReading = { faceCount: 1, lookingAway: true };
  const facing: FaceReading = { faceCount: 1, lookingAway: false };

  it("allows a glance shorter than three seconds", () => {
    // Readings every 2s: only 2s elapsed at the second one.
    const { flags } = run([away, away], 2000);
    expect(flags.flat()).toEqual([]);
  });

  it("flags once the turn passes three seconds", () => {
    // 0s, 2s, 4s.
    const { flags } = run([away, away, away], 2000);
    expect(flags).toEqual([[], [], ["looking_away"]]);
  });

  it("resets the moment the student faces the camera again", () => {
    const { flags } = run([away, facing, away, away], 2000);
    expect(flags.flat()).toEqual([]);
  });

  it("is ignored unless exactly one face is visible", () => {
    const crowd: FaceReading = { faceCount: 2, lookingAway: true };
    const { flags } = run([crowd, crowd], 2000);
    expect(flags.flat()).not.toContain("looking_away");
  });

  it("treats a bare face count as facing the camera", () => {
    const { flags } = run([1, 1, 1, 1], 2000);
    expect(flags.flat()).toEqual([]);
  });

  it("flags sooner than the no-face rule, as configured", () => {
    expect(DEFAULT_THRESHOLDS.lookingAwayMs).toBeLessThan(
      DEFAULT_THRESHOLDS.noFaceMs,
    );
    expect(PROCTOR_MESSAGES.looking_away.length).toBeGreaterThan(10);
  });
});
