// Shared co-sign approval (two-tab fix): Pow proposes once → BOTH tabs see
// the SAME open approval (Pow SIGNED / PREEVAN WAITING) → PREEVAN ratifies in
// her tab → 2/2 → Execute 200. No per-tab duplicates, no teammate-forging,
// no red "approval not found". RED until GET /api/approvals?roomId= +
// findOpenApproval + idempotent propose land.

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — rely on injected env */
}

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  auth: {
    getSession: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/rooms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rooms")>();
  return { ...actual, isMember: vi.fn() };
});

vi.stubEnv("BATON_EPHEMERAL", "1");
vi.stubEnv("CO_SIGN_WINDOW_MS", "60000");

import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import * as rooms from "@/lib/rooms";
import { GET as approvalsGET, POST as approvalsPOST } from "../app/api/approvals/route";
import { findOpenApproval, listApprovals, resetApprovals } from "../lib/approvals";

function post(body: unknown): Request {
  return new Request("http://localhost/api/approvals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(url: string): Request {
  return new Request(url, { method: "GET" });
}

const ROOM = "war-cosign-shared";
const OTHER = "war-cosign-other";
const HASH = "shared-payload-hash-64-hex";

const mockedAuth = vi.mocked(auth);
const mockedHeaders = vi.mocked(headers);
const mockedIsMember = vi.mocked(
  (rooms as unknown as { isMember: typeof rooms.isMember }).isMember,
);

function sessionAs(id: string, name: string) {
  mockedHeaders.mockResolvedValue(new Headers({ cookie: "sid=abc" }));
  mockedAuth.getSession.mockResolvedValue({
    data: { user: { id, name, role: "Observer" } },
    error: null,
  } as never);
}

beforeEach(() => {
  resetApprovals();
  mockedHeaders.mockResolvedValue(new Headers());
  mockedAuth.getSession.mockReset();
  mockedIsMember.mockResolvedValue(true);
});

describe("shared open approval (two tabs, one approval)", () => {
  it("propose in ctx-A → GET open in ctx-B sees the SAME approval id awaiting ratify", async () => {
    sessionAs("u_pow", "pow");
    const proposed = await approvalsPOST(
      post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose" }),
    );
    expect(proposed.status).toBe(201);
    const { id } = (await proposed.json()) as { id: string };
    expect(id).toBeTruthy();

    // Second tab, different human: the room's ONE open approval is the same id.
    sessionAs("u_preevan", "preevan");
    const open = await approvalsGET(
      get(`http://localhost/api/approvals?roomId=${ROOM}&payloadHash=${HASH}`),
    );
    expect(open.status).toBe(200);
    const body = (await open.json()) as {
      open: { id: string; status: string; signatures: string } | null;
    };
    expect(body.open?.id).toBe(id);
    expect(body.open?.status).toBe("pending");
    expect(body.open?.signatures).toBe("1/2");
  });

  it("second propose with same room+payloadHash returns the SAME id (no per-tab duplicates)", async () => {
    sessionAs("u_pow", "pow");
    const first = await approvalsPOST(
      post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose" }),
    );
    const { id: id1 } = (await first.json()) as { id: string };

    // PREEVAN's tab proposes too (the old bug: a parallel 1/2). Must join, not fork.
    sessionAs("u_preevan", "preevan");
    const second = await approvalsPOST(
      post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose" }),
    );
    expect(second.status).toBe(200);
    const { id: id2 } = (await second.json()) as { id: string };
    expect(id2).toBe(id1);
    expect(listApprovals().filter((a) => a.roomId === ROOM)).toHaveLength(1);
    expect(findOpenApproval(ROOM, HASH)?.id).toBe(id1);
  });

  it("ratify in ctx-B → 2/2 → execute 200 on the shared id", async () => {
    sessionAs("u_pow", "pow");
    const proposed = await approvalsPOST(
      post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose" }),
    );
    const { id } = (await proposed.json()) as { id: string };

    sessionAs("u_preevan", "preevan");
    const ratified = await approvalsPOST(
      post({ roomId: ROOM, step: "ratify", approvalId: id, payloadHash: HASH }),
    );
    expect(ratified.status).toBe(200);
    expect(await ratified.json()).toMatchObject({ id, signatures: "2/2" });

    const executed = await approvalsPOST(post({ roomId: ROOM, step: "execute", approvalId: id }));
    expect(executed.status).toBe(200);
  });

  it("GET open is membership-scoped: non-member → 403, other room sees null", async () => {
    sessionAs("u_pow", "pow");
    const proposed = await approvalsPOST(
      post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose" }),
    );
    expect(proposed.status).toBe(201);

    sessionAs("u_stranger", "stranger");
    mockedIsMember.mockResolvedValue(false);
    const denied = await approvalsGET(get(`http://localhost/api/approvals?roomId=${ROOM}`));
    expect(denied.status).toBe(403);

    // Cross-room: no leak, just null (fail-closed, no red text on the client).
    sessionAs("u_other", "other");
    mockedIsMember.mockResolvedValue(true);
    const cross = await approvalsGET(get(`http://localhost/api/approvals?roomId=${OTHER}`));
    expect(cross.status).toBe(200);
    expect(((await cross.json()) as { open: unknown }).open).toBeNull();
  });

  it("GET open with none open → 200 {open:null} (client renders nothing, not red text)", async () => {
    sessionAs("u_pow", "pow");
    const res = await approvalsGET(get(`http://localhost/api/approvals?roomId=${ROOM}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ open: null });
  });
});

describe("fail-closed invariants (never break)", () => {
  it("same-human ratify → 403", async () => {
    sessionAs("u_pow", "pow");
    const proposed = await approvalsPOST(
      post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose" }),
    );
    const { id } = (await proposed.json()) as { id: string };
    const res = await approvalsPOST(
      post({ roomId: ROOM, step: "ratify", approvalId: id, payloadHash: HASH }),
    );
    expect(res.status).toBe(403);
  });

  it("payloadHash mismatch → 403", async () => {
    sessionAs("u_pow", "pow");
    const proposed = await approvalsPOST(
      post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose" }),
    );
    const { id } = (await proposed.json()) as { id: string };
    sessionAs("u_preevan", "preevan");
    const res = await approvalsPOST(
      post({ roomId: ROOM, step: "ratify", approvalId: id, payloadHash: "tampered" }),
    );
    expect(res.status).toBe(403);
  });

  it("window expiry → 403", async () => {
    vi.useFakeTimers();
    try {
      const t0 = Date.now();
      vi.setSystemTime(t0);
      sessionAs("u_pow", "pow");
      const proposed = await approvalsPOST(
        post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose" }),
      );
      const { id } = (await proposed.json()) as { id: string };
      vi.setSystemTime(t0 + 61_000);
      sessionAs("u_preevan", "preevan");
      const res = await approvalsPOST(
        post({ roomId: ROOM, step: "ratify", approvalId: id, payloadHash: HASH }),
      );
      expect(res.status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cross-room ratify → 403 isolation_violation", async () => {
    sessionAs("u_pow", "pow");
    const proposed = await approvalsPOST(
      post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose" }),
    );
    const { id } = (await proposed.json()) as { id: string };
    sessionAs("u_preevan", "preevan");
    const res = await approvalsPOST(
      post({ roomId: OTHER, step: "ratify", approvalId: id, payloadHash: HASH }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { event: string }).event).toBe("isolation_violation");
  });

  it("body.actor is ignored: spoofed actor → 403 actor_spoof", async () => {
    sessionAs("u_pow", "pow");
    const res = await approvalsPOST(
      post({ roomId: ROOM, action: "rollback", payloadHash: HASH, step: "propose", actor: "mallory" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ event: "actor_spoof" });
  });
});
