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

  it("outbox insert -> claim via SKIP LOCKED -> ack", { timeout: 60000 }, async () => {
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

  it("approval insert -> quorum check (distinct humans, fail-closed)", { timeout: 60000 }, async () => {
    const { sql } = await import("drizzle-orm");
    const mkUser = async (name: string) => {
      const res = (await db.db.execute(
        sql`INSERT INTO neon_auth."user" (name, email, "emailVerified") VALUES (${name}, ${`${name}@test.local`}, true) RETURNING id`,
      )) as unknown as { rows: { id: string }[] };
      return res.rows[0]!.id;
    };
    const aliceId = await mkUser(`alice-${Date.now()}`);
    const bobId = await mkUser(`bob-${Date.now()}`);
    try {
      const roomId = `war-test-${Date.now()}`;
      const created = await db.requestApproval({
        roomId,
        action: "handoff.close",
        payloadHash: "abc123",
        proposer: "alice",
        actorId: aliceId,
        windowEndsAt: new Date(Date.now() + 60_000),
      });
      expect(created.actorId).toBe(aliceId);
      expect(await db.approvalQuorum({ id: created.id })).toBe(false);

      // Same human cannot ratify their own proposal (fail-closed).
      await expect(
        db.ratifyApproval({ id: created.id, ratifier: "alice", ratifierId: aliceId }),
      ).rejects.toThrow();

      await db.ratifyApproval({ id: created.id, ratifier: "bob", ratifierId: bobId });
      expect(await db.approvalQuorum({ id: created.id })).toBe(true);

      await db.db.execute(sql`DELETE FROM approvals WHERE id = ${created.id}`);
    } finally {
      await db.db.execute(sql`DELETE FROM neon_auth."user" WHERE id IN (${aliceId}, ${bobId})`);
    }
  });
});
