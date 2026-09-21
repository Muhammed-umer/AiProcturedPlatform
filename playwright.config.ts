import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the real app through a browser: real forms, real
 * server actions, real PostgreSQL. The dev server is started for us and reused
 * if one is already running on the port.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  // A little headroom over the 5s default, though the production server below
  // has no on-demand compilation so requests are fast.
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The camera-proctored exam asks for the webcam before it starts.
    permissions: ["camera"],
  },
  projects: [
    {
      name: "chromium",
      // The full Chrome-for-Testing build (new headless) supports the
      // Fullscreen API that the exam screen requires; the lightweight headless
      // shell does not.
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        launchOptions: {
          // A synthetic webcam so the camera gate passes without hardware.
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
          ],
        },
      },
    },
  ],
  // Test the production build: no dev-mode on-demand compilation, so server
  // actions and pages respond immediately, matching how the app is deployed.
  webServer: {
    command: "npm run build && npm run start",
    // The synthetic camera below shows a test pattern, not a face, so the
    // start-of-test face check is turned off. Everything else about the camera
    // path - permission, capture, upload, warnings - is exercised for real.
    env: { PROCTOR_FACE_GATE: "off" },
    url: "http://localhost:3000/login",
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
