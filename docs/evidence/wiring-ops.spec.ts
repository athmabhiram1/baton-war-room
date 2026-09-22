// Ops-panel wiring evidence: every tile reflects server state, hashes are real.
// Run: npx playwright test --config=playwright.wiring.config.ts
import { test, expect } from "@playwright/test";

test("ops wiring: real hash propose -> live signers/badge/countdown -> sweep", async ({
  page,
}) => {
  const room = "opsdemo";
  const roomId = `war-${room}`;
  await page.goto(`/room/${room}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#qInput")).toBeVisible({ timeout: 30000 });
  await page.locator('.ops-tab[data-tab="approval"]').click();

  const tile = page.locator("#cosignTile");
  await expect
    .poll(async () => tile.getAttribute("data-payload-hash"), { timeout: 30000 })
    .toMatch(/^[0-9a-f]{64}$/);
  const liveHash = (await tile.getAttribute("data-payload-hash")) as string;

  await page.getByRole("button", { name: /Propose rollback/ }).click();
  await expect(page.locator("#apProg")).toContainText("1 of 2 signatures", {
    timeout: 30000,
  });
  await expect(page.locator('[data-signer="arun.m"]')).toContainText("SIGNED");
  await expect(page.locator('[data-signer="priya.k"]')).toContainText("WAITING");
  await expect(page.locator("#pane-approval .hashrow b")).toContainText(
    `${liveHash.slice(0, 8)}`,
  );

  const ratify = (await page.evaluate(
    async ([id, rid, hash]) => {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: rid,
          step: "ratify",
          approvalId: id,
          actor: "priya.k",
          payloadHash: hash,
        }),
      });
      return { status: res.status, body: await res.json() };
    },
    [(await tile.getAttribute("data-approval-id")) as string, roomId, liveHash],
  )) as { status: number; body: { signatures: string } };
  expect(ratify.status).toBe(200);
  expect(ratify.body.signatures).toBe("2/2");

  await expect(page.locator("#apProg")).toContainText("2 of 2 signatures", {
    timeout: 30000,
  });
  await expect(page.locator('[data-signer="priya.k"]')).toContainText("SIGNED", {
    timeout: 30000,
  });

  await page.getByRole("button", { name: /Run reconciler sweep/ }).click();
  await expect(page.locator("#reconStatus")).toContainText("Last sweep", {
    timeout: 30000,
  });

  await page.screenshot({ path: "docs/evidence/wiring-ops.png" });
});
