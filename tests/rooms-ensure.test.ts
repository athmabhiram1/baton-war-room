import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db", () => ({
  db: {},
  rooms: { code: "code", createdBy: "createdBy" },
  roomMembers: {
    roomCode: "roomCode",
    userId: "userId",
    role: "role",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ eq: args }),
  and: (...args: unknown[]) => ({ and: args }),
}));

import { ensureMembership } from "../lib/rooms";
import { db } from "../lib/db";

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function chainWith(selectRows: unknown[], insertRows: unknown[]): Chain {
  const c = {} as Chain;
  c.limit = vi.fn(async () => selectRows);
  c.from = vi.fn(() => c);
  c.where = vi.fn(() => c);
  c.select = vi.fn(() => c);
  c.returning = vi.fn(async () => insertRows);
  c.onConflictDoNothing = vi.fn(() => c);
  c.onConflictDoUpdate = vi.fn(() => c);
  c.values = vi.fn(() => c);
  c.insert = vi.fn(() => c);
  return c;
}

describe("ensureMembership (direct-URL join)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates room + member when neither exists", async () => {
    const c = chainWith([], [{ code: "war-7331ed", role: "Observer" }]);
    (db as { select?: unknown; insert?: unknown }).select = c.select;
    (db as { select?: unknown; insert?: unknown }).insert = c.insert;
    const res = await ensureMembership("war-7331ed", "user-1", "Observer");
    expect(res.member.role).toBe("Observer");
    expect(c.insert).toHaveBeenCalledTimes(2);
  });

  it("is idempotent when room + member exist", async () => {
    const c = chainWith([{ code: "war-7331ed", role: "Observer" }], []);
    (db as { select?: unknown; insert?: unknown }).select = c.select;
    (db as { select?: unknown; insert?: unknown }).insert = c.insert;
    const res = await ensureMembership("war-7331ed", "user-1", "Observer");
    expect(res.member.role).toBe("Observer");
    expect(c.insert).not.toHaveBeenCalled();
  });

  it("rejects invalid codes without touching the db", async () => {
    const c = chainWith([], []);
    (db as { select?: unknown; insert?: unknown }).select = c.select;
    (db as { select?: unknown; insert?: unknown }).insert = c.insert;
    await expect(ensureMembership("nope", "user-1", "Observer")).rejects.toThrow();
    expect(c.insert).not.toHaveBeenCalled();
    expect(c.select).not.toHaveBeenCalled();
  });
});
