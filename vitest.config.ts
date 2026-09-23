import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests live under src. The Playwright end-to-end specs under e2e/ are run
// by Playwright, not Vitest, so they are excluded here.
export default defineConfig({
  resolve: {
    // The same "@/..." imports the app uses (tsconfig paths).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
