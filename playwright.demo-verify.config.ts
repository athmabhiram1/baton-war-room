import { defineConfig } from "@playwright/test";

// Evidence-only config for demo-readiness verification (does not touch suites in tests/).
export default defineConfig({
  testDir: "./docs/evidence",
  testMatch: "demo-verify.spec.ts",
  timeout: 120000,
  use: {
    baseURL: "http://localhost:3112",
  },
  reporter: "line",
});
