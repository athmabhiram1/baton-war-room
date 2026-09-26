import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  auth: {
    handler: vi.fn(),
    getSession: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import { POST as loginPOST } from "../app/api/auth/login/route";
import { POST as logoutPOST } from "../app/api/auth/logout/route";
import { GET as meGET } from "../app/api/me/route";

const mockedAuth = vi.mocked(auth);
const mockedHeaders = vi.mocked(headers);

function loginReq(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function anonUpstream(userId: string, setCookie: string[]): Response {
  return new Response(JSON.stringify({ user: { id: userId } }), {
    status: 200,
    headers: setCookie.map((c) => ["set-cookie", c] as [string, string]),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.test.local");
    mockedHeaders.mockResolvedValue(new Headers());
  });

  it("returns 400 when name is empty (never touches auth)", async () => {
    const res = await loginPOST(loginReq({ name: "   ", role: "Observer" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name_required" });
    expect(mockedAuth.handler).not.toHaveBeenCalled();
  });

  it("returns 400 when role is not allowlisted", async () => {
    const res = await loginPOST(loginReq({ name: "Ada", role: "admin" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_role" });
    expect(mockedAuth.handler).not.toHaveBeenCalled();
  });

  it("never accepts userId from the body (spoof ignored)", async () => {
    const post = vi.fn(async () => anonUpstream("u_real", ["sid=abc; Path=/"]));
    mockedAuth.handler.mockReturnValue({ POST: post } as never);
    mockedAuth.updateUser.mockResolvedValue({ data: null, error: null } as never);

    const res = await loginPOST(
      loginReq({ name: "Ada", role: "Observer", userId: "mallory" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("u_real");
    expect(body.user.id).not.toBe("mallory");
    expect(body.user).toEqual({ id: "u_real", name: "Ada", role: "Observer" });
  });

  it("returns 200 {user} and forwards the session cookie", async () => {
    const post = vi.fn(async () =>
      anonUpstream("u_123", ["__Secure-neon-auth.session_token=s3cr3t; Path=/; HttpOnly"]),
    );
    mockedAuth.handler.mockReturnValue({ POST: post } as never);
    mockedAuth.updateUser.mockResolvedValue({ data: null, error: null } as never);

    const res = await loginPOST(loginReq({ name: "Ada", role: "Comms lane" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u_123", name: "Ada", role: "Comms lane" },
    });
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.includes("session_token"))).toBe(true);
  });

  it("returns 503 when NEON_AUTH_BASE_URL is absent (live deferred)", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    const res = await loginPOST(loginReq({ name: "Ada", role: "Observer" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "auth_unavailable" });
  });

  it("returns 503 auth_anonymous_disabled when upstream anonymous is 404 (provider off)", async () => {
    const post = vi.fn(async () => new Response("", { status: 404 }));
    mockedAuth.handler.mockReturnValue({ POST: post } as never);
    const res = await loginPOST(loginReq({ name: "Ada", role: "Observer" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "auth_anonymous_disabled" });
  });
});

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.test.local");
    mockedHeaders.mockResolvedValue(new Headers());
  });

  it("destroys the session, clears cookies, returns 200 {ok:true}", async () => {
    mockedAuth.signOut.mockResolvedValue({ data: { success: true }, error: null } as never);

    const res = await logoutPOST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockedAuth.signOut).toHaveBeenCalledOnce();
    const cleared = res.headers.getSetCookie().join("\n");
    expect(cleared).toContain("__Secure-neon-auth.session_token");
  });

  it("returns 503 when NEON_AUTH_BASE_URL is absent", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    const res = await logoutPOST();
    expect(res.status).toBe(503);
  });
});

describe("GET /api/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.test.local");
    mockedHeaders.mockResolvedValue(new Headers({ cookie: "sid=abc" }));
  });

  it("returns 200 {user} when a session exists", async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { user: { id: "u_123", name: "Ada", role: "Observer" } },
      error: null,
    } as never);

    const res = await meGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u_123", name: "Ada", role: "Observer" },
    });
    expect(mockedAuth.getSession).toHaveBeenCalledOnce();
  });

  it("returns 401 when no session exists (no body userId accepted — GET)", async () => {
    mockedAuth.getSession.mockResolvedValue({ data: null, error: null } as never);

    const res = await meGET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 without touching auth when no cookie is presented", async () => {
    mockedHeaders.mockResolvedValue(new Headers());

    const res = await meGET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mockedAuth.getSession).not.toHaveBeenCalled();
  });

  it("returns 503 when the backend is unreachable", async () => {
    mockedAuth.getSession.mockRejectedValue(new Error("fetch failed"));

    const res = await meGET();
    expect(res.status).toBe(503);
  });
});
