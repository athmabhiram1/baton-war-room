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
// DB-touching fns. Route-level 200s prove wiring; live DB is proven via the
// store script + SELECT in the T4 evidence note (NEON_AUTH_BASE_URL absent,
// so live cookie sessions are deferred).
vi.mock("@/lib/rooms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rooms")>();
  return {
    ...actual,
    getRoom: vi.fn(),
    createRoom: vi.fn(),
    upsertMember: vi.fn(),
  };
});

import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import {
  createRoom,
  getRoom,
  normalizeRoomCode,
  upsertMember,
} from "@/lib/rooms";
import { POST as ensurePOST } from "../app/api/rooms/ensure/route";
import { POST as joinPOST } from "../app/api/rooms/join/route";

const mockedAuth = vi.mocked(auth);
const mockedHeaders = vi.mocked(headers);
const mockedGetRoom = vi.mocked(getRoom);
const mockedCreateRoom = vi.mocked(createRoom);
const mockedUpsertMember = vi.mocked(upsertMember);

function authed() {
  mockedHeaders.mockResolvedValue(new Headers({ cookie: "sid=abc" }));
  mockedAuth.getSession.mockResolvedValue({
    data: { user: { id: "u_ada", name: "Ada", role: "Observer" } },
    error: null,
  } as never);
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/rooms/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("normalizeRoomCode (war-<id>, RoomProvider + liveblocks-auth compatible)", () => {
  it("trims and lowercases to canonical form", () => {
    expect(normalizeRoomCode("  WAR-Demo01 ")).toBe("war-demo01");
  });

  it("rejects codes outside the war- namespace", () => {
    expect(normalizeRoomCode("other-room")).toBeNull();
  });

  it("rejects empty/short/bad-charset/overlong/non-string input", () => {
    expect(normalizeRoomCode("war-")).toBeNull();
    expect(normalizeRoomCode("")).toBeNull();
    expect(normalizeRoomCode("war-a$b")).toBeNull();
    expect(normalizeRoomCode(`war-${"a".repeat(65)}`)).toBeNull();
    expect(normalizeRoomCode(undefined)).toBeNull();
    expect(normalizeRoomCode(42)).toBeNull();
  });
});

describe("POST /api/rooms/ensure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authed();
  });

  it("returns 401 without touching auth when no cookie is presented", async () => {
    mockedHeaders.mockResolvedValue(new Headers());
    const res = await ensurePOST(post({ code: "war-demo01" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mockedAuth.getSession).not.toHaveBeenCalled();
  });

  it("returns 401 when no session exists", async () => {
    mockedAuth.getSession.mockResolvedValue({ data: null, error: null } as never);
    const res = await ensurePOST(post({ code: "war-demo01" }));
    expect(res.status).toBe(401);
    expect(mockedGetRoom).not.toHaveBeenCalled();
  });

  it("returns 400 for a code outside the war- charset", async () => {
    const res = await ensurePOST(post({ code: "other-room" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_code" });
    expect(mockedGetRoom).not.toHaveBeenCalled();
  });

  it("creates the room when absent, then upserts membership (200)", async () => {
    mockedGetRoom.mockResolvedValue(null);
    mockedCreateRoom.mockResolvedValue({ code: "war-demo01", createdBy: "u_ada" });
    mockedUpsertMember.mockResolvedValue({ role: "Observer" });

    const res = await ensurePOST(post({ code: "war-demo01" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      room: { code: "war-demo01" },
      member: { role: "Observer" },
    });
    expect(mockedCreateRoom).toHaveBeenCalledWith("war-demo01", "u_ada");
    expect(mockedUpsertMember).toHaveBeenCalledWith(
      "war-demo01",
      "u_ada",
      "Observer",
    );
  });

  it("skips creation for an existing room and re-upserts idempotently (200)", async () => {
    mockedGetRoom.mockResolvedValue({ code: "war-demo01", createdBy: "u_ada" });
    mockedUpsertMember.mockResolvedValue({ role: "Observer" });

    const first = await ensurePOST(post({ code: "war-demo01" }));
    const second = await ensurePOST(post({ code: "war-demo01" }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockedCreateRoom).not.toHaveBeenCalled();
    expect(mockedUpsertMember).toHaveBeenCalledTimes(2);
  });

  it("normalizes the code before touching the store", async () => {
    mockedGetRoom.mockResolvedValue({ code: "war-demo01", createdBy: "u_ada" });
    mockedUpsertMember.mockResolvedValue({ role: "Observer" });

    await ensurePOST(post({ code: "WAR-Demo01" }));
    expect(mockedGetRoom).toHaveBeenCalledWith("war-demo01");
    expect(mockedUpsertMember).toHaveBeenCalledWith(
      "war-demo01",
      "u_ada",
      "Observer",
    );
  });
});

describe("POST /api/rooms/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authed();
  });

  it("returns 401 without touching auth when no cookie is presented", async () => {
    mockedHeaders.mockResolvedValue(new Headers());
    const res = await joinPOST(post({ code: "war-demo01" }));
    expect(res.status).toBe(401);
    expect(mockedAuth.getSession).not.toHaveBeenCalled();
  });

  it("returns 400 for a code outside the war- charset", async () => {
    const res = await joinPOST(post({ code: "nope" }));
    expect(res.status).toBe(400);
    expect(mockedGetRoom).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown code and never creates", async () => {
    mockedGetRoom.mockResolvedValue(null);
    const res = await joinPOST(post({ code: "war-ghost99" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "room_not_found" });
    expect(mockedCreateRoom).not.toHaveBeenCalled();
    expect(mockedUpsertMember).not.toHaveBeenCalled();
  });

  it("upserts membership on an existing room, idempotent 200, never creates", async () => {
    mockedGetRoom.mockResolvedValue({ code: "war-demo01", createdBy: "u_ada" });
    mockedUpsertMember.mockResolvedValue({ role: "Observer" });

    const first = await joinPOST(post({ code: "war-demo01" }));
    const second = await joinPOST(post({ code: "war-demo01" }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      room: { code: "war-demo01" },
      member: { role: "Observer" },
    });
    expect(second.status).toBe(200);
    expect(mockedCreateRoom).not.toHaveBeenCalled();
    expect(mockedUpsertMember).toHaveBeenCalledTimes(2);
  });
});
