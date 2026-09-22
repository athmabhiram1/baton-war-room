import { defineConfig } from "@playwright/test";

// Evidence-only config for the ops-panel wire-or-honest task (does not
// touch the T5 suite in tests/ or the T4 evidence config).
export default defineConfig({
  testDir: "./docs/evidence",
  testMatch: "ops-wired.spec.ts",
  timeout: 180000,
  use: {
    baseURL: "http://localhost:3112",
  },
  reporter: "line",
});
