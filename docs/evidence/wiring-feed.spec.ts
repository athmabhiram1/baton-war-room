// War-feed + composer wiring evidence: every formerly-static button now
// performs a live fetch and renders server data.
// Run: npx playwright test --config=playwright.wiring-feed.config.ts
import { expect, test } from "@playwright/test";

test("feed wiring: cite -> checkpoint -> kill/attach -> 20-query probe", async ({
  page,
}) => {
  await page.goto("/room/wiringfeed?fixture=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#qInput")).toBeVisible({ timeout: 30000 });

  // (a) Cite button opens the citation source panel (id/score/text).
  await page.locator("#qInput").fill("Why are we seeing 5xx on checkout?");
  await page.locator("#sendBtn").click();
  const cite = page.locator(".cite").first();
  await expect(cite).toBeVisible({ timeout: 30000 });
  await cite.click();
  const detail = page.locator(".cite-detail").first();
  await expect(detail).toBeVisible({ timeout: 15000 });
  await expect(detail).toContainText(/score/);

  // (b) Write checkpoint hits POST /api/turn + handoff initiate; toast shows ck id.
  await page.getByRole("button", { name: "Write checkpoint now" }).click();
  await expect(page.locator("#toasts")).toContainText(/Checkpoint ck_/, {
    timeout: 60000,
  });

  // (c) Kill hits handoff initiate; attach ACKs and replays the checkpoint.
  await page.getByRole("button", { name: "Simulate agent kill (S2)" }).click();
  await expect(page.locator("#toasts")).toContainText(/Agent killed.*checkpoint ck_/, {
    timeout: 30000,
  });
  await page.locator('.ops-tab[data-tab="agent"]').click();
  await page.getByRole("button", { name: "Attach successor agent" }).click();
  await expect(page.locator("#toasts")).toContainText(/Successor attached.*replayed/, {
    timeout: 60000,
  });

  // (d) Run-probe fires 20 live /api/query calls and renders measured p50/p95.
  await page.locator('.ops-tab[data-tab="slo"]').click();
  await page.getByRole("button", { name: "Run 20-query probe" }).click();
  await expect(page.locator("#toasts")).toContainText(/Probe: p50 \d+ms · p95 \d+ms/, {
    timeout: 150000,
  });
  await expect(page.locator("#pane-slo")).toContainText(/n =\s*20 queries/);

  await page.screenshot({ path: "docs/evidence/wiring-feed.png" });
});
