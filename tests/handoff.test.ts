// T5 governance gates: handoff 409→ACK→200, co-sign quorum, cross-room
// DENY + isolation_violation, reconciler sweep, retry→ESCALATED, funnel.
// Short overrides only (CO_SIGN_WINDOW_MS=60000, RECONCILER_INTERVAL_MS=5000,
// BATON_EPHEMERAL=1 for zero-I/O stores) — never real 10-min waits.
// No LLM calls here (generation mocked/irrelevant; protects 250 RPD).

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — rely on injected env */
}

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("BATON_EPHEMERAL", "1");
vi.stubEnv("CO_SIGN_WINDOW_MS", "60000");
vi.stubEnv("RECONCILER_INTERVAL_MS", "5000");

import { POST as handoffPOST } from "../app/api/handoff/route";
import { POST as approvalsPOST } from "../app/api/approvals/route";
import { GET as reconcilerGET, POST as reconcilerPOST } from "../app/api/reconciler/route";
import { resetHandoffs } from "../lib/handoff";
import { listApprovals, resetApprovals } from "../lib/approvals";
import { resetReconciler } from "../lib/reconciler";
import { resetFunnel, withFunnel } from "../lib/funnel";
import { runWithRetry } from "../lib/retry";
import { approvalQuorum } from "../lib/db-contracts";

function req(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ROOM = "war-t5-test";
const OTHER = "war-t5-other";

beforeEach(() => {
  resetHandoffs();
  resetApprovals();
  resetReconciler();
  resetFunnel();
});

describe("POST /api/handoff (409→ACK→200)", () => {
  it("409s close on PENDING_HANDOFF without ACK, 200s after ACK", async () => {
    const init = await handoffPOST(req({ roomId: ROOM, action: "initiate", actor: "arun.m" }));
    expect(init.status).toBe(200);
    const initBody = (await init.json()) as { state: string; checkpoint: string };
    expect(initBody.state).toBe("pending");
    expect(initBody.checkpoint).toMatch(/^ck_/);

    const blocked = await handoffPOST(req({ roomId: ROOM, action: "close", actor: "arun.m" }));
    expect(blocked.status).toBe(409);
    const blockedBody = (await blocked.json()) as { error: string };
    expect(blockedBody.error).toMatch(/PENDING_HANDOFF/);

    const ack = await handoffPOST(req({ roomId: ROOM, action: "ack", actor: "p.krishnan" }));
    expect(ack.status).toBe(200);
    const ackBody = (await ack.json()) as { state: string; checkpoint: string; resume: unknown };
    expect(ackBody.state).toBe("acked");
    expect(ackBody.resume).toBeDefined();

    const closed = await handoffPOST(req({ roomId: ROOM, action: "close", actor: "arun.m" }));
    expect(closed.status).toBe(200);
    const closedBody = (await closed.json()) as { sealed: boolean };
    expect(closedBody.sealed).toBe(true);
  });

  it("400s without roomId (fail-closed)", async () => {
    const res = await handoffPOST(req({ action: "initiate", actor: "arun.m" }));
    expect(res.status).toBe(400);
  });
});

describe("co-sign quorum (2 distinct humans, same payloadHash, window)", () => {
  it("1/2 blocked on execute, 2/2 executes", async () => {
    const proposed = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "a94f06e9", actor: "arun.m", step: "propose" }),
    );
    expect(proposed.status).toBe(201);
    const { id } = (await proposed.json()) as { id: string };

    const early = await approvalsPOST(req({ roomId: ROOM, step: "execute", approvalId: id }));
    expect(early.status).toBe(403);
    expect(((await early.json()) as { signatures: string }).signatures).toBe("1/2");

    const ratified = await approvalsPOST(
      req({ roomId: ROOM, step: "ratify", approvalId: id, actor: "priya.k", payloadHash: "a94f06e9" }),
    );
    expect(ratified.status).toBe(200);

    const executed = await approvalsPOST(req({ roomId: ROOM, step: "execute", approvalId: id }));
    expect(executed.status).toBe(200);
    expect(((await executed.json()) as { signatures: string }).signatures).toBe("2/2");
  });

  it("same-human ratify DENYs fail-closed", async () => {
    const proposed = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "hash1", actor: "arun.m", step: "propose" }),
    );
    const { id } = (await proposed.json()) as { id: string };
    const res = await approvalsPOST(
      req({ roomId: ROOM, step: "ratify", approvalId: id, actor: "arun.m", payloadHash: "hash1" }),
    );
    expect(res.status).toBe(403);
  });

  it("payloadHash mismatch DENYs fail-closed", async () => {
    const proposed = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "hash1", actor: "arun.m", step: "propose" }),
    );
    const { id } = (await proposed.json()) as { id: string };
    const res = await approvalsPOST(
      req({ roomId: ROOM, step: "ratify", approvalId: id, actor: "priya.k", payloadHash: "tampered" }),
    );
    expect(res.status).toBe(403);
  });
});

describe("cross-room isolation (DENY + isolation_violation)", () => {
  it("ratify/execute from another room DENYs", async () => {
    const proposed = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "h", actor: "arun.m", step: "propose" }),
    );
    const { id } = (await proposed.json()) as { id: string };
    const res = await approvalsPOST(
      req({ roomId: OTHER, step: "ratify", approvalId: id, actor: "priya.k", payloadHash: "h" }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { event: string };
    expect(body.event).toBe("isolation_violation");
  });

  it("rooms never share approval rows", async () => {
    await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "h", actor: "arun.m", step: "propose" }),
    );
    const mine = listApprovals().filter((a) => a.roomId === OTHER);
    expect(mine).toHaveLength(0);
  });
});

describe("durable HITL reconciler (short overrides, no 5-min wait)", () => {
  it("flips stale pending approvals to expired", async () => {
    const proposed = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "h", actor: "arun.m", step: "propose" }),
    );
    const { id } = (await proposed.json()) as { id: string };
    const swept = await reconcilerPOST(req({ now: Date.now() + 61_000 }));
    expect(swept.status).toBe(200);
    const body = (await swept.json()) as { expired: string[] };
    expect(body.expired).toContain(id);
  });

  it("honors RECONCILER_INTERVAL_MS override and reports status", async () => {
    const status = await reconcilerGET();
    expect(status.status).toBe(200);
    const body = (await status.json()) as { intervalMs: number };
    expect(body.intervalMs).toBe(5000);
  });
});

describe("retry ceiling (max 3 → ESCALATED + audit row)", () => {
  it("fails twice then succeeds on attempt 3", async () => {
    let calls = 0;
    const out = await runWithRetry(async () => {
      calls += 1;
      if (calls < 3) throw new Error(`boom-${calls}`);
      return "recovered";
    });
    expect(out).toMatchObject({ status: "ok", attempts: 3, value: "recovered" });
  });

  it("3 failures → escalated with audit hook fired", async () => {
    const exhausted = vi.fn(async () => ({}));
    const out = await runWithRetry(
      async () => {
        throw new Error("always");
      },
      { onExhausted: exhausted },
    );
    expect(out).toMatchObject({ status: "escalated", attempts: 3 });
    expect(exhausted).toHaveBeenCalledTimes(1);
    expect(exhausted).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 3, lastError: "always" }),
    );
  });
});

describe("scoped funnel (per-room single-writer, pushIndex+audit only)", () => {
  it("serializes same-room writes in order", async () => {
    const order: number[] = [];
    const slow = withFunnel(ROOM, async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push(1);
      return 1;
    });
    const fast = withFunnel(ROOM, async () => {
      order.push(2);
      return 2;
    });
    expect(await slow).toBe(1);
    expect(await fast).toBe(2);
    expect(order).toEqual([1, 2]);
  });

  it("db approval quorum helper stays fail-closed without ratifier", async () => {
    expect(
      await approvalQuorum({ id: "missing", roomId: ROOM, now: Date.now() }),
    ).toBe(false);
  });
});
