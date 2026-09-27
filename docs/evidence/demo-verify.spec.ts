// Demo-readiness verification: room render + one query round-trip + ?fixture badge.
// Run: npx playwright test --config=playwright.demo-verify.config.ts
import { expect, test } from "@playwright/test";

test("demo-verify: room render + query round-trip + fixture badge", async ({
  page,
}) => {
  // Room is session-gated (proxy.ts): log in via API first; page.request
  // shares cookies with the browser context.
  const stamp = Date.now();
  const login = await page.request.post("/api/auth/login", {
    data: {
      name: "Demo Verify",
      role: "Observer",
      email: `demo-verify-${stamp}@example.com`,
      password: "EvalPass123!",
    },
  });
  if (!login.ok()) throw new Error(`login ${login.status()}`);
  await page.goto("/room/war-demo?fixture=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#qInput")).toBeVisible({ timeout: 30000 });
  // Fixture badge visible (zero-spend rehearsal mode).
  await expect(page.getByText("FIXTURE").first()).toBeVisible({ timeout: 15000 });

  // One query round-trip → cited answer renders.
  await page.locator("#qInput").fill("SEV1 triage rollback");
  await page.locator("#sendBtn").click();
  await expect(page.locator(".cite").first()).toBeVisible({ timeout: 30000 });

  await page.screenshot({ path: "docs/evidence/demo-verify.png" });
});
