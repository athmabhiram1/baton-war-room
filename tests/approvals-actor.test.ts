// T5 approvals actor binding (Wave 3, docs/BACKEND_PLAN.md).
// Actor derived ONLY from Neon Auth getSession; body.actor is never trusted:
// present-but-mismatched → 403 actor_spoof + audit. Reads/writes scoped by
// room membership (lib/rooms isMember) + tenant_id. Co-sign unchanged:
// distinct humans, same payloadHash, W-window, fail-closed.
// Auth is mocked (NEON_AUTH_BASE_URL likely absent — live deferred).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  auth: { getSession: vi.fn() },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

// Partial mock: keep the real normalizeRoomCode/ROOM_CODE_RE, stub only the
// DB-touching fns. Default: every caller is a member (200 paths); the
// non-member test flips isMember to false for a 403.
vi.mock("@/lib/rooms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rooms")>();
  return {
    ...actual,
    getRoom: vi.fn(),
    createRoom: vi.fn(),
    upsertMember: vi.fn(),
    isMember: vi.fn(),
  };
});

vi.stubEnv("BATON_EPHEMERAL", "1");
vi.stubEnv("CO_SIGN_WINDOW_MS", "60000");

import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import * as rooms from "@/lib/rooms";
import { POST as approvalsPOST } from "../app/api/approvals/route";
import { resetApprovals } from "../lib/approvals";

const mockedAuth = vi.mocked(auth);
const mockedHeaders = vi.mocked(headers);
const mockedIsMember = vi.mocked(
  (rooms as unknown as { isMember: typeof rooms.isMember }).isMember,
);

const ROOM = "war-t5-actor";

function req(body: unknown): Request {
  return new Request("http://localhost/api/approvals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Present a session cookie + getSession user for the next call(s). */
function asUser(id: string) {
  mockedHeaders.mockResolvedValue(new Headers({ cookie: "sid=abc" }));
  mockedAuth.getSession.mockResolvedValue({
    data: { user: { id, name: id, role: "Observer" } },
    error: null,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetApprovals();
  mockedIsMember.mockResolvedValue(true);
});

describe("actor binding (session-only, body.actor never trusted)", () => {
  it("spoofed body.actor → 403 actor_spoof, never stamped as proposer", async () => {
    asUser("u_alice");
    const res = await approvalsPOST(
      req({
        roomId: ROOM,
        action: "rollback",
        payloadHash: "h1",
        actor: "mallory",
        step: "propose",
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ event: "actor_spoof" });
  });

  it("propose stamps proposer = session user (no body actor needed)", async () => {
    asUser("u_alice");
    const proposed = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "h1", step: "propose" }),
    );
    expect(proposed.status).toBe(201);

    // Second human ratifies with session identity only → 2/2.
    const { id } = (await proposed.json()) as { id: string };
    asUser("u_bob");
    const ratified = await approvalsPOST(
      req({ roomId: ROOM, step: "ratify", approvalId: id, payloadHash: "h1" }),
    );
    expect(ratified.status).toBe(200);
    expect(await ratified.json()).toMatchObject({ status: "ratified" });
  });

  it("self-ratify (same session user) → 403 fail-closed", async () => {
    asUser("u_alice");
    const proposed = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "h1", step: "propose" }),
    );
    expect(proposed.status).toBe(201);
    const { id } = (await proposed.json()) as { id: string };

    const res = await approvalsPOST(
      req({ roomId: ROOM, step: "ratify", approvalId: id, payloadHash: "h1" }),
    );
    expect(res.status).toBe(403);
  });

  it("1/2 execute → 403 blocked; 2/2 → 200 executed (session actors only)", async () => {
    asUser("u_alice");
    const proposed = await approvalsPOST(
      req({ roomId: ROOM, action: "deploy", payloadHash: "h2", step: "propose" }),
    );
    const { id } = (await proposed.json()) as { id: string };

    const early = await approvalsPOST(
      req({ roomId: ROOM, step: "execute", approvalId: id }),
    );
    expect(early.status).toBe(403);
    expect(((await early.json()) as { signatures: string }).signatures).toBe("1/2");

    asUser("u_bob");
    const ratified = await approvalsPOST(
      req({ roomId: ROOM, step: "ratify", approvalId: id, payloadHash: "h2" }),
    );
    expect(ratified.status).toBe(200);

    const executed = await approvalsPOST(
      req({ roomId: ROOM, step: "execute", approvalId: id }),
    );
    expect(executed.status).toBe(200);
    expect(((await executed.json()) as { signatures: string }).signatures).toBe("2/2");
  });

  it("ratify past the W-window → 403 fail-closed", async () => {
    vi.useFakeTimers();
    try {
      const t0 = Date.now();
      vi.setSystemTime(t0);
      asUser("u_alice");
      const proposed = await approvalsPOST(
        req({ roomId: ROOM, action: "rollback", payloadHash: "h3", step: "propose" }),
      );
      const { id } = (await proposed.json()) as { id: string };

      vi.setSystemTime(t0 + 61_000);
      asUser("u_bob");
      const res = await approvalsPOST(
        req({ roomId: ROOM, step: "ratify", approvalId: id, payloadHash: "h3" }),
      );
      expect(res.status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("auth + membership gates", () => {
  it("401 without touching auth when no cookie is presented", async () => {
    mockedHeaders.mockResolvedValue(new Headers());
    const res = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "h", step: "propose" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mockedAuth.getSession).not.toHaveBeenCalled();
  });

  it("401 when no session exists", async () => {
    mockedHeaders.mockResolvedValue(new Headers({ cookie: "sid=abc" }));
    mockedAuth.getSession.mockResolvedValue({ data: null, error: null } as never);
    const res = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "h", step: "propose" }),
    );
    expect(res.status).toBe(401);
  });

  it("non-member → 403 (reads/writes scoped by room membership)", async () => {
    asUser("u_stranger");
    mockedIsMember.mockResolvedValue(false);
    const res = await approvalsPOST(
      req({ roomId: ROOM, action: "rollback", payloadHash: "h", step: "propose" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ event: "not_member" });
  });
});

describe("migration 0004 actor FK (schema contract)", () => {
  it("adds actor_id NOT NULL → neon_auth FK + nullable ratifier_id FK", () => {
    const sql = readFileSync(
      resolve(__dirname, "../drizzle/0004_approvals_actor.sql"),
      "utf8",
    );
    expect(sql).toMatch(/actor_id/i);
    expect(sql).toMatch(/NOT NULL/i);
    expect(sql).toMatch(/REFERENCES/i);
    expect(sql).toMatch(/neon_auth/i);
    expect(sql).toMatch(/ratifier_id/i);
  });
});
