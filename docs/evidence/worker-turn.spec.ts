import { test, expect } from "@playwright/test";

// T4 evidence: posting to war-feed yields a cited agent answer end-to-end.
// Run with DISABLE_LLM=1 (extractive, zero generation) to protect the G1
// budget: npx playwright test --config=playwright.evidence.config.ts
test("worker turn posts a cited answer to the war-feed", async ({ page }) => {
  await page.goto("/room/demo", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#qInput")).toBeVisible({ timeout: 20000 });

  await page.fill("#qInput", "What is the rollback plan right now?");
  await page.click("#sendBtn");

  const feed = page.locator(".anslist");
  await expect(feed).toHaveAttribute("data-agent-status", "complete", { timeout: 60000 });

  const answer = page.locator(".ablock").last();
  await expect(answer).toBeVisible();
  await expect(answer.locator(".cite").first()).toBeVisible();

  await page.locator("#scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({ path: "docs/evidence/worker-turn.png" });
});
