import { defineConfig } from "vitest/config";

// Unit tests live under src. The Playwright end-to-end specs under e2e/ are run
// by Playwright, not Vitest, so they are excluded here.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
