import { defineConfig } from "@playwright/test";

// Evidence-only config for palette-close proof (does not touch suites in tests/).
export default defineConfig({
  testDir: "./docs/evidence",
  testMatch: "palette-close.spec.ts",
  timeout: 240000,
  use: {
    baseURL: "http://localhost:3112",
  },
  reporter: "line",
});
