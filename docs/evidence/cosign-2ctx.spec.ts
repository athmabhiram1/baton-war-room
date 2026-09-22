// T5 evidence: 2-context co-sign flow (arun proposes, priya ratifies).
// Run: npx playwright test --config=playwright.cosign.config.ts
import { test, expect } from "@playwright/test";

test("2-context co-sign: propose (arun) -> ratify (priya) -> execute at 2/2", async ({
  browser,
}) => {
  const room = "t5demo";
  const roomId = `war-${room}`;
  const ctxArun = await browser.newContext();
  const ctxPriya = await browser.newContext();
  const arun = await ctxArun.newPage();
  const priya = await ctxPriya.newPage();

  await arun.goto(`/room/${room}`, { waitUntil: "domcontentloaded" });
  await expect(arun.locator("#qInput")).toBeVisible({ timeout: 30000 });
  await arun.locator('.ops-tab[data-tab="approval"]').click();
  await arun.getByRole("button", { name: /Propose rollback/ }).click();
  await expect(arun.locator("#apProg")).toContainText("1 of 2 signatures", {
    timeout: 30000,
  });
  const approvalId = await arun.locator("#cosignTile").getAttribute("data-approval-id");
  expect(approvalId).toBeTruthy();

  // Second human in a SEPARATE browser context ratifies (webhook-resume path).
  // The payloadHash is the real client-computed SHA-256 — read it live.
  await priya.goto(`/room/${room}`, { waitUntil: "domcontentloaded" });
  const liveHash = await arun.locator("#cosignTile").getAttribute("data-payload-hash");
  expect(liveHash).toMatch(/^[0-9a-f]{64}$/);
  const ratify = (await priya.evaluate(
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
    [approvalId, roomId, liveHash],
  )) as { status: number; body: { signatures: string } };
  expect(ratify.status).toBe(200);
  expect(ratify.body.signatures).toBe("2/2");

  // First context's 5s poll fallback picks up quorum without reload.
  await expect(arun.locator("#apProg")).toContainText("2 of 2 signatures", {
    timeout: 30000,
  });
  await arun.locator("#scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await arun.screenshot({ path: "docs/evidence/cosign-2ctx.png" });

  await arun.getByRole("button", { name: /Execute \(2\/2\)/ }).click();
  await expect(arun.locator("#apDone")).toContainText("execute: 2/2", {
    timeout: 30000,
  });

  await ctxArun.close();
  await ctxPriya.close();
});
