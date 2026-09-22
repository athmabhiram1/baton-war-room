import { expect, test } from "@playwright/test";

// Ops-panel wire-or-honest proof: every ops element either hits a live
// endpoint or is visibly illustrative; zero fake-live numbers.
test("ops panel is wired live, no fake-live numbers", async ({ page }) => {
  await page.goto("/room/ops-wired");
  await expect(page.locator("#viewApp")).toBeVisible({ timeout: 30000 });

  // Open the ops panel tabs we assert on.
  const openTab = async (name: "approval" | "handoff" | "slo") => {
    await page.locator(`.ops-tab[data-tab="${name}"]`).click();
  };

  // 1. Approval pane: derived (not hardcoded) payload hash + honest signers.
  await openTab("approval");
  const hashText = await page.locator(".hashrow b").first().innerText();
  expect(hashText).toMatch(/^[0-9a-f]{8}…[0-9a-f]{5}$/);
  expect(hashText).not.toContain("a94f06e9");
  await expect(page.locator('[data-signer="arun.m"]')).toHaveText("IDLE");
  await expect(page.locator('[data-signer="priya.k"]')).toHaveText("IDLE");

  // 2. SLO tiles mirror live /api/metrics (em-dash only when truly no samples).
  await openTab("slo");
  const tiles = page.locator("#pane-slo .tile b span");
  const m = (await page.request.get("/api/metrics").then((r) => r.json())) as {
    p50: number;
    p95: number;
    sampleSize: number;
  };
  await expect(tiles.nth(1)).toHaveText(m.sampleSize === 0 ? "—" : String(m.p50));
  await expect(tiles.nth(2)).toHaveText(m.sampleSize === 0 ? "—" : String(m.p95));

  // 3. Initiate handoff → banner shows a LIVE countdown (ticks down).
  await openTab("handoff");
  await page.getByRole("button", { name: "Initiate handoff" }).click();
  const banner = page.locator("#hoBanner.show");
  await expect(banner).toBeVisible({ timeout: 15000 });
  const t1 = await page.locator("#hoTime").innerText();
  expect(t1).toMatch(/^\d{2}:\d{2}$/);
  await page.waitForTimeout(2200);
  const t2 = await page.locator("#hoTime").innerText();
  expect(t2).toMatch(/^\d{2}:\d{2}$/);
  expect(t2 <= t1).toBe(true);

  // 4. Banner Take over → live ACK (banner clears, gate opens).
  await banner.getByRole("button", { name: "Take over" }).click();
  await expect(page.getByText("Ownership ACK recorded")).toBeVisible({ timeout: 15000 });
  await expect(banner).toBeHidden();

  // 5. Reconciler sweep hits the live endpoint.
  await openTab("approval");
  await page.getByRole("button", { name: "Run reconciler sweep" }).click();
  await expect(page.getByText("Reconciler sweep complete")).toBeVisible({ timeout: 15000 });
  const reconStatus = await page.locator("#reconStatus").innerText();
  expect(reconStatus).toContain("Last sweep");

  // 6. Real 20-query probe → live p50/p95 tiles + SLO verdict.
  await openTab("slo");
  await page.getByRole("button", { name: "Run 20-query probe" }).click();
  await expect(page.getByText(/^Probe: p50 \d+ms · p95 \d+ms$/)).toBeVisible({ timeout: 170000 });
  const p50 = await tiles.nth(1).innerText();
  const p95 = await tiles.nth(2).innerText();
  expect(p50).toMatch(/^\d+$/);
  expect(p95).toMatch(/^\d+$/);
  await expect(page.locator("#chipVerdict")).not.toHaveText("NO PROBE YET");
  const n = await page.locator("#pane-slo .ltmeta span span").first().innerText();
  expect(Number(n)).toBeGreaterThanOrEqual(20);

  await page.screenshot({ path: "docs/evidence/ops-wired.png", fullPage: false });
});
