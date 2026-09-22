import { expect, test } from "@playwright/test";

test("cite button expands inline source", async ({ page }) => {
  await page.goto("/room/feed-wired?fixture=1");
  const input = page.locator("#qInput");
  await input.fill("Why are we seeing 5xx on checkout?");
  await page.locator("#sendBtn").click();
  const cite = page.locator(".cite").first();
  await expect(cite).toBeVisible({ timeout: 15000 });
  await expect(cite).toHaveAttribute("aria-expanded", "false");
  await cite.click();
  await expect(cite).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".cite-detail").first()).toBeVisible();
  await page.screenshot({ path: "docs/evidence/feed-wired.png" });
});
