// Shared co-sign evidence: Pow proposes once → BOTH tabs show the SAME open
// approval (Pow SIGNED / PREEVAN WAITING) → PREEVAN ratifies in her tab as
// herself → 2/2 → Execute 200. Zero "approval not found", zero teammate-forge.
// Run: npx playwright test --config=playwright.cosign.config.ts
import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

async function login(page: Page, name: string, email: string): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#ctaEnter")).toBeVisible({ timeout: 30000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("baton:open-login", { detail: { action: "switch-identity" } }),
      );
    });
    try {
      await expect(page.locator("#modal-login")).toBeVisible({ timeout: 2000 });
      break;
    } catch {
      // Listener not attached yet (hydration race) — redispatch.
    }
  }
  await expect(page.locator("#modal-login")).toBeVisible();
  await page.fill("#login-name", name);
  await page.fill("#login-email", email);
  await page.fill("#login-password", "cosign-proof-1");
  await page.selectOption("#login-role", "Observer");
  await page.click("#login-go");
  await expect(page.locator("#modal-login")).toBeHidden({ timeout: 30000 });
  await expect(page.locator("#jb-you")).toContainText(name, { timeout: 30000 });
}

async function joinRoom(page: Page, code: string): Promise<void> {
  await page.fill("#join-code", code);
  await page.click("#join-go");
  await expect(page).toHaveURL(new RegExp(`/room/${code}`), { timeout: 30000 });
  await expect(page.locator("#qInput")).toBeVisible({ timeout: 30000 });
}

test("2-context shared co-sign: one proposal, both tabs, ratify-as-self, execute", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const room = "cosignshared";
  let ctxPow: BrowserContext | null = null;
  let ctxPreevan: BrowserContext | null = null;
  try {
    ctxPow = await browser.newContext();
    ctxPreevan = await browser.newContext();
    const pow = await ctxPow.newPage();
    const preevan = await ctxPreevan.newPage();

    await login(pow, "Pow Proof", "pow-cosign@example.com");
    await login(preevan, "Preevan Proof", "preevan-cosign@example.com");

    await joinRoom(pow, room);
    await joinRoom(preevan, room);

    // Pow proposes once.
    await pow.locator('.ops-tab[data-tab="approval"]').click();
    await pow.getByRole("button", { name: /Propose rollback/ }).click();
    await expect(pow.locator("#apProg")).toContainText("1 of 2 signatures", {
      timeout: 30000,
    });
    const approvalId = await pow.locator("#cosignTile").getAttribute("data-approval-id");
    expect(approvalId).toBeTruthy();
    const liveHash = await pow.locator("#cosignTile").getAttribute("data-payload-hash");
    expect(liveHash).toMatch(/^[0-9a-f]{64}$/);

    // PREEVAN's tab adopts the SAME open approval on mount — no second 1/2.
    await preevan.locator('.ops-tab[data-tab="approval"]').click();
    await expect(preevan.locator("#apProg")).toContainText("1 of 2 signatures", {
      timeout: 30000,
    });
    const preevanId = await preevan.locator("#cosignTile").getAttribute("data-approval-id");
    expect(preevanId).toBe(approvalId);

    // No teammate-forging control anywhere.
    await expect(preevan.getByRole("button", { name: /Sign as teammate/ })).toHaveCount(0);
    await expect(pow.getByRole("button", { name: /Sign as teammate/ })).toHaveCount(0);

    // PREEVAN ratifies strictly as herself via the tile.
    await preevan.getByRole("button", { name: /Sign as / }).click();
    await expect(preevan.locator("#apProg")).toContainText("2 of 2 signatures", {
      timeout: 30000,
    });

    // Pow's tab converges on the shared row via the 5s poll — no reload.
    await expect(pow.locator("#apProg")).toContainText("2 of 2 signatures", {
      timeout: 30000,
    });
    // Never red "approval not found" on either tab.
    await expect(pow.locator("#apDone")).not.toContainText("approval not found");
    await expect(preevan.locator("#apDone")).not.toContainText("approval not found");

    await pow.screenshot({ path: "docs/evidence/cosign-shared.png" });

    await pow.getByRole("button", { name: /Execute \(2\/2\)/ }).click();
    await expect(pow.locator("#apDone")).toContainText("execute: 2/2", {
      timeout: 30000,
    });
  } finally {
    await ctxPow?.close();
    await ctxPreevan?.close();
  }
});
