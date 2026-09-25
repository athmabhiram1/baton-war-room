import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  auth: {
    getSession: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

// Partial mock: keep the real normalizeRoomCode/ROOM_CODE_RE, stub only the
// DB-touching membership read. logAudit is stubbed so cross-room tests never
// touch Postgres. Liveblocks is stubbed so token binding is deterministic
// (no secret, no network): authorize() echoes the bound userId in the token.
vi.mock("@/lib/rooms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rooms")>();
  return {
    ...actual,
    getMember: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  logAudit: vi.fn(),
}));

const lb = vi.hoisted(() => ({
  userId: "" as string,
  opts: {} as Record<string, unknown>,
  room: "" as string,
  perm: "" as string,
}));

vi.mock("@liveblocks/node", () => ({
  Liveblocks: vi.fn(function () {
    return {
      prepareSession: (userId: string, opts: Record<string, unknown>) => {
        lb.userId = userId;
        lb.opts = opts;
        return {
          FULL_ACCESS: "FULL_ACCESS",
          allow: (room: string, perm: string) => {
            lb.room = room;
            lb.perm = perm;
          },
          authorize: async () => ({
            status: 200,
            body: JSON.stringify({ token: `tok-${userId}` }),
          }),
        };
      },
    };
  }),
}));

import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import { logAudit } from "@/lib/db";
import { getMember } from "@/lib/rooms";
import { POST } from "../app/api/liveblocks-auth/route";

const mockedAuth = vi.mocked(auth);
const mockedHeaders = vi.mocked(headers);
const mockedGetMember = vi.mocked(getMember);
const mockedLogAudit = vi.mocked(logAudit);

function authed() {
  mockedHeaders.mockResolvedValue(new Headers({ cookie: "sid=abc" }));
  mockedAuth.getSession.mockResolvedValue({
    data: { user: { id: "u_ada", name: "Ada", role: "Observer" } },
    error: null,
  } as never);
}

function req(body: unknown) {
  return new Request("http://localhost/api/liveblocks-auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/liveblocks-auth (T7 session-bound)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LIVEBLOCKS_SECRET_KEY = "sk_test_dummy";
    authed();
  });

  it("returns 401 without touching auth when no cookie is presented", async () => {
    mockedHeaders.mockResolvedValue(new Headers());
    const res = await POST(req({ room: "war-demo01" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mockedAuth.getSession).not.toHaveBeenCalled();
    expect(mockedGetMember).not.toHaveBeenCalled();
  });

  it("returns 401 when no session exists", async () => {
    mockedAuth.getSession.mockResolvedValue({ data: null, error: null } as never);
    const res = await POST(req({ room: "war-demo01" }));
    expect(res.status).toBe(401);
    expect(mockedGetMember).not.toHaveBeenCalled();
  });

  it("returns 403 + isolation_violation audit for a non-member room", async () => {
    mockedGetMember.mockResolvedValue(null);
    const res = await POST(req({ room: "war-other01" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "forbidden",
      event: "isolation_violation",
    });
    expect(mockedLogAudit).toHaveBeenCalledWith({
      roomId: "war-other01",
      event: "isolation_violation",
      details: { userId: "u_ada", reason: "non_member" },
    });
    expect(lb.userId).toBe("");
  });

  it("binds the token to the session user with FULL_ACCESS on the member room (200)", async () => {
    mockedGetMember.mockResolvedValue({ role: "Observer" });
    const res = await POST(req({ room: "war-demo01" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string };
    expect(body.token).toBe("tok-u_ada");
    expect(lb.userId).toBe("u_ada");
    expect(lb.room).toBe("war-demo01");
    expect(lb.perm).toBe("FULL_ACCESS");
    expect(lb.opts).toEqual({ userInfo: { name: "Ada", role: "Observer" } });
    expect(mockedLogAudit).not.toHaveBeenCalled();
  });

  it("requires a room and returns 400 when missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("denies rooms outside the war- namespace with 403", async () => {
    const res = await POST(req({ room: "other-room" }));
    expect(res.status).toBe(403);
  });
});
