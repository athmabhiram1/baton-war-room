import { defineConfig } from "@playwright/test";

// Evidence-only config for the approval display-vs-state fix.
export default defineConfig({
  testDir: "./docs/evidence",
  testMatch: "approval-display.spec.ts",
  timeout: 240000,
  use: {
    baseURL: "http://localhost:3112",
  },
  reporter: "line",
});
