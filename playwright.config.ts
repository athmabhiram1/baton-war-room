import { defineConfig } from "@playwright/test";

// Full 2-browser matrix lands with T5 (tests/e2e.spec.ts). Scaffold placeholder.
export default defineConfig({
  testDir: "./tests",
  testMatch: "e2e.spec.ts",
});
