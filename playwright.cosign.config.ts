import { defineConfig } from "@playwright/test";

// Evidence-only config for T5 (does not touch the T5 suite in tests/).
export default defineConfig({
  testDir: "./docs/evidence",
  testMatch: "cosign-2ctx.spec.ts",
  timeout: 120000,
  use: {
    baseURL: "http://localhost:3112",
  },
  reporter: "line",
});
