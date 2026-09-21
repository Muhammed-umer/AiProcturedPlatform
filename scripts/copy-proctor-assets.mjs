/**
 * Copies the MediaPipe wasm runtime from node_modules into public/, where the
 * exam page loads it from. Runs automatically after `npm install`.
 *
 * The runtime is ~35 MB, so it is not committed; the small face model next to
 * it (public/proctor/blaze_face_short_range.tflite) is, because the lab server
 * has no internet to fetch it.
 */

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url),
);
const target = fileURLToPath(new URL("../public/proctor/wasm/", import.meta.url));

if (!existsSync(source)) {
  console.warn(
    "copy-proctor-assets: @mediapipe/tasks-vision is not installed; skipping.",
  );
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("copy-proctor-assets: MediaPipe runtime copied to public/proctor/wasm");
