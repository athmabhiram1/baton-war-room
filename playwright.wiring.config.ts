import { defineConfig } from "@playwright/test";

// Evidence-only config for ops-panel wiring (does not touch suites in tests/).
export default defineConfig({
  testDir: "./docs/evidence",
  testMatch: "wiring-ops.spec.ts",
  timeout: 120000,
  use: {
    baseURL: "http://localhost:3112",
  },
  reporter: "line",
});
