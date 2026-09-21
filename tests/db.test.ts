import { describe, expect, it } from "vitest";

// Local runs load .env (Vercel injects env in prod). Values are never printed.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — rely on injected env */
}

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("war-room postgres (lib/db + drizzle/0001)", async () => {
  const db = await import("../lib/db");

  it("outbox insert -> claim via SKIP LOCKED -> ack", async () => {
    const roomId = `war-test-${Date.now()}`;
    const row = await db.enqueueOutbox({
      roomId,
      kind: "handoff.requested",
      payload: { note: "red-green" },
    });
    expect(row.id).toBeDefined();

    const claimed = await db.claimOutbox({ roomId, limit: 1 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe(row.id);

    await db.ackOutbox(claimed[0]!.id);
    const drained = await db.claimOutbox({ roomId, limit: 1 });
    expect(drained).toHaveLength(0);
  });

  it("approval insert -> quorum check (distinct humans, fail-closed)", async () => {
    const roomId = `war-test-${Date.now()}`;
    const created = await db.requestApproval({
      roomId,
      action: "handoff.close",
      payloadHash: "abc123",
      proposer: "alice",
      windowEndsAt: new Date(Date.now() + 60_000),
    });
    expect(await db.approvalQuorum({ id: created.id })).toBe(false);

    // Same human cannot ratify their own proposal (fail-closed).
    await expect(
      db.ratifyApproval({ id: created.id, ratifier: "alice" }),
    ).rejects.toThrow();

    await db.ratifyApproval({ id: created.id, ratifier: "bob" });
    expect(await db.approvalQuorum({ id: created.id })).toBe(true);
  });
});
