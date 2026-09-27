// Approval display-vs-state proof: at 2/2 executed BOTH tabs show filled
// rings, green executed text, and NO sign button.
// Run: npx playwright test --config=playwright.approval.config.ts
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
  await page.fill("#login-password", "approval-proof-1");
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

test("approval display: executed fills both rings, green text, no sign button", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const room = "approvalfix";
  let ctxA: BrowserContext | null = null;
  let ctxB: BrowserContext | null = null;
  try {
    ctxA = await browser.newContext();
    ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    await login(a, "Ana Proof", "ana-display@example.com");
    await login(b, "Ben Proof", "ben-display@example.com");

    await joinRoom(a, room);
    await joinRoom(b, room);

    await a.locator('.ops-tab[data-tab="approval"]').click();
    await a.getByRole("button", { name: /Propose rollback/ }).click();
    await expect(a.locator("#apProg")).toContainText("1 of 2 signatures", {
      timeout: 30000,
    });
    // Proposer tab: neutral signed state, never an actionable button.
    await expect(a.getByRole("button", { name: /waiting for co-sign/ })).toBeVisible({
      timeout: 30000,
    });
    // Me ring filled while the row says SIGNED.
    await expect(a.locator('#pane-approval .signer.on')).toHaveCount(1, {
      timeout: 30000,
    });

    // Peer tab adopts the same row; its sign action stays self-only.
    await b.locator('.ops-tab[data-tab="approval"]').click();
    await expect(b.locator("#apProg")).toContainText("1 of 2 signatures", {
      timeout: 30000,
    });
    await expect(b.getByRole("button", { name: /Sign as teammate/ })).toHaveCount(0);
    await expect(b.getByRole("button", { name: /Sign as / })).toHaveCount(1);

    await b.getByRole("button", { name: /Sign as / }).click();
    await expect(b.locator("#apProg")).toContainText("2 of 2 signatures", {
      timeout: 30000,
    });
    await expect(a.locator("#apProg")).toContainText("2 of 2 signatures", {
      timeout: 30000,
    });

    await a.getByRole("button", { name: /Execute \(2\/2\)/ }).click();
    await expect(a.locator("#apDone.show.good")).toContainText("execute: 2/2", {
      timeout: 30000,
    });

    // Peer tab converges via the 5s poll — same executed display, no reload.
    await expect(b.locator("#apDone.show.good")).toContainText("execut", {
      timeout: 30000,
    });

    for (const page of [a, b]) {
      // (a) both rings filled.
      await expect(page.locator('#pane-approval .signer.on')).toHaveCount(2, {
        timeout: 30000,
      });
      // (b) executed text uses success styling, never .fail red.
      await expect(page.locator("#apDone.show.good")).toBeVisible();
      await expect(page.locator("#apDone.fail")).toHaveCount(0);
      // (c) no sign action and no execute action once executed.
      await expect(page.getByRole("button", { name: /Sign as / })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Execute \(/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /waiting for co-sign/ })).toHaveCount(0);
    }

    await a.screenshot({ path: "docs/evidence/approval-display.png" });
    await b.screenshot({ path: "docs/evidence/approval-display-peer.png" });
  } finally {
    await ctxA?.close();
    await ctxB?.close();
  }
});
