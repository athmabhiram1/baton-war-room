// Palette-close proof: palette closes via x, scrim-click, input-Esc, global-Esc.
// Run: npx playwright test --config=playwright.palette.config.ts
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const EMAIL = "palette-close-proof@example.com";
const PASSWORD = "palette-proof-1";
const NAME = "Palette Proof";

async function login(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#ctaEnter")).toBeVisible({ timeout: 30000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("baton:open-login", { detail: { action: "switch-identity" } }),
      );
    });
    try {
      await expect(page.locator("#modal-login")).toBeVisible({ timeout: 1500 });
      break;
    } catch {
      // Listener not attached yet (hydration race) — redispatch.
    }
  }
  await expect(page.locator("#modal-login")).toBeVisible({ timeout: 15000 });
  await page.fill("#login-name", NAME);
  await page.fill("#login-email", EMAIL);
  await page.fill("#login-password", PASSWORD);
  await page.selectOption("#login-role", "Observer");
  const loginResp = page.waitForResponse(
    (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.click("#login-go");
  expect((await loginResp).status()).toBe(200);
  await expect(page.locator("#modal-login")).toBeHidden({ timeout: 30000 });
}

async function openPalette(page: Page): Promise<void> {
  await login(page);
  await page.goto("/room/paletteclose?fixture=1", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("#viewApp")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: /All commands/ }).click();
  await expect(page.locator("#palette")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#palInput")).toBeFocused({ timeout: 15000 });
}

test("palette closes via x button", async ({ page }) => {
  await openPalette(page);
  await page.getByRole("button", { name: /Close command palette/ }).click();
  await expect(page.locator("#palette")).toBeHidden({ timeout: 15000 });
});

test("palette closes via scrim click", async ({ page }) => {
  await openPalette(page);
  await page.locator("#scrim").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#palette")).toBeHidden({ timeout: 15000 });
});

test("palette closes via input Esc", async ({ page }) => {
  await openPalette(page);
  await page.locator("#palInput").press("Escape");
  await expect(page.locator("#palette")).toBeHidden({ timeout: 15000 });
});

test("palette closes via global Esc", async ({ page }) => {
  await openPalette(page);
  // Blur out of the input so only the window-level Esc handler can close it.
  await page.locator("#palInput").evaluate((el) => (el as HTMLElement).blur());
  await page.keyboard.press("Escape");
  await expect(page.locator("#palette")).toBeHidden({ timeout: 15000 });
  await page.screenshot({ path: "docs/evidence/palette-close.png" });
});
