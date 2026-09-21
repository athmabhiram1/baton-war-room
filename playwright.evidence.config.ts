import { defineConfig } from "@playwright/test";

// Evidence-only config for T4 (does not touch the T5 suite in tests/).
export default defineConfig({
  testDir: "./docs/evidence",
  testMatch: "worker-turn.spec.ts",
  timeout: 90000,
  use: {
    baseURL: "http://localhost:3112",
  },
  reporter: "line",
});
