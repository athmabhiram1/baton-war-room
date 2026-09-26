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

// POST /api/auth/login {name, role, email, password} → Neon email flow via the
// auth proxy: sign-in/email first, sign-up/email fallback for new users.
// Single call from the client's view → 200 {user} + session cookie.
function okUpstream(userId: string, setCookie: string[]): Response {
  return new Response(JSON.stringify({ user: { id: userId } }), {
    status: 200,
    headers: setCookie.map((c) => ["set-cookie", c] as [string, string]),
  });
}

function errUpstream(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type ProxyPost = (
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) => Promise<Response>;

// Dispatches on the proxied Neon path, like the real auth handler mount.
function proxyRouter(routes: Record<string, (req: Request) => Promise<Response> | Response>): ProxyPost {
  return async (req, ctx) => {
    const path = (await ctx.params).path.join("/");
    const route = routes[path];
    if (!route) return new Response("", { status: 404 });
    return route(req);
  };
}

async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const LOGIN = { name: "Ada", role: "Observer", email: "ada@example.com", password: "s3cure-pass" };

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.test.local");
    mockedHeaders.mockResolvedValue(new Headers());
  });

  it("returns 400 when name is empty (never touches auth)", async () => {
    const res = await loginPOST(loginReq({ ...LOGIN, name: "   " }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name_required" });
    expect(mockedAuth.handler).not.toHaveBeenCalled();
  });

  it("returns 400 when role is not allowlisted", async () => {
    const res = await loginPOST(loginReq({ ...LOGIN, role: "admin" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_role" });
    expect(mockedAuth.handler).not.toHaveBeenCalled();
  });

  it("returns 400 email_required when email is missing (never touches auth)", async () => {
    const { email: _drop, ...rest } = LOGIN;
    const res = await loginPOST(loginReq(rest));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "email_required" });
    expect(mockedAuth.handler).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_email when email is malformed (never touches auth)", async () => {
    const res = await loginPOST(loginReq({ ...LOGIN, email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_email" });
    expect(mockedAuth.handler).not.toHaveBeenCalled();
  });

  it("returns 400 password_required when password is missing (never touches auth)", async () => {
    const { password: _drop, ...rest } = LOGIN;
    const res = await loginPOST(loginReq(rest));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "password_required" });
    expect(mockedAuth.handler).not.toHaveBeenCalled();
  });

  it("returns 400 password_too_short when password is under 8 chars (never touches auth)", async () => {
    const res = await loginPOST(loginReq({ ...LOGIN, password: "short" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "password_too_short" });
    expect(mockedAuth.handler).not.toHaveBeenCalled();
  });

  it("never accepts userId from the body (spoof ignored)", async () => {
    const post = vi.fn(
      proxyRouter({
        "sign-in/email": () => okUpstream("u_real", ["sid=abc; Path=/"]),
      }),
    );
    mockedAuth.handler.mockReturnValue({ POST: post } as never);
    mockedAuth.updateUser.mockResolvedValue({ data: null, error: null } as never);

    const res = await loginPOST(
      loginReq({ ...LOGIN, userId: "mallory" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("u_real");
    expect(body.user.id).not.toBe("mallory");
    expect(body.user).toEqual({ id: "u_real", name: "Ada", role: "Observer" });
  });

  it("signs in via sign-in/email: 200 {user} and forwards the session cookie", async () => {
    const seen: Record<string, unknown>[] = [];
    const post = vi.fn(
      proxyRouter({
        "sign-in/email": async (req) => {
          seen.push(await jsonBody(req));
          return okUpstream("u_123", ["__Secure-neon-auth.session_token=s3cr3t; Path=/; HttpOnly"]);
        },
      }),
    );
    mockedAuth.handler.mockReturnValue({ POST: post } as never);
    mockedAuth.updateUser.mockResolvedValue({ data: null, error: null } as never);

    const res = await loginPOST(loginReq(LOGIN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u_123", name: "Ada", role: "Observer" },
    });
    // Email + password reach Neon; name/role stay app-side (updateUser best-effort).
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ email: "ada@example.com", password: "s3cure-pass" });
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.includes("session_token"))).toBe(true);
  });

  it("signs up unknown users: sign-in miss → sign-up/email → 200 (one client call)", async () => {
    const calls: string[] = [];
    const post = vi.fn(
      proxyRouter({
        "sign-in/email": () => {
          calls.push("sign-in/email");
          return errUpstream(400, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
        },
        "sign-up/email": async (req) => {
          calls.push("sign-up/email");
          const body = await jsonBody(req);
          expect(body).toMatchObject({ email: "ada@example.com", password: "s3cure-pass" });
          return okUpstream("u_new", ["sid=new; Path=/"]);
        },
      }),
    );
    mockedAuth.handler.mockReturnValue({ POST: post } as never);
    mockedAuth.updateUser.mockResolvedValue({ data: null, error: null } as never);

    const res = await loginPOST(loginReq(LOGIN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u_new", name: "Ada", role: "Observer" },
    });
    expect(calls).toEqual(["sign-in/email", "sign-up/email"]);
    expect(res.headers.getSetCookie().some((c) => c.includes("sid=new"))).toBe(true);
  });

  it("returns 401 invalid_credentials on wrong password (sign-up reports existing)", async () => {
    const post = vi.fn(
      proxyRouter({
        "sign-in/email": () =>
          errUpstream(400, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }),
        "sign-up/email": () =>
          errUpstream(422, { code: "USER_ALREADY_EXISTS", message: "User already exists" }),
      }),
    );
    mockedAuth.handler.mockReturnValue({ POST: post } as never);

    const res = await loginPOST(loginReq({ ...LOGIN, password: "wrong-pass-1" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  it("maps name/role onto the session via updateUser best-effort (login survives its failure)", async () => {
    const post = vi.fn(
      proxyRouter({
        "sign-in/email": () => okUpstream("u_123", ["sid=abc; Path=/"]),
      }),
    );
    mockedAuth.handler.mockReturnValue({ POST: post } as never);
    mockedAuth.updateUser.mockRejectedValue(new Error("boom"));

    const res = await loginPOST(loginReq(LOGIN));
    expect(res.status).toBe(200);
    expect(mockedAuth.updateUser).toHaveBeenCalledOnce();
    const args = mockedAuth.updateUser.mock.calls[0][0] as { body?: unknown };
    expect(args.body).toMatchObject({ name: "Ada" });
  });

  it("returns 503 when NEON_AUTH_BASE_URL is absent (live deferred)", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    const res = await loginPOST(loginReq(LOGIN));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "auth_unavailable" });
  });

  it("proxies through /api/auth-prefixed URLs the passthrough can route", async () => {
    const seenUrls: string[] = [];
    const post = vi.fn(
      proxyRouter({
        "sign-in/email": async (req) => {
          seenUrls.push((req as Request).url);
          return okUpstream("u_123", ["sid=abc; Path=/"]);
        },
      }),
    );
    mockedAuth.handler.mockReturnValue({ POST: post } as never);
    mockedAuth.updateUser.mockResolvedValue({ data: null, error: null } as never);

    const res = await loginPOST(loginReq(LOGIN));
    expect(res.status).toBe(200);
    expect(seenUrls.length).toBeGreaterThan(0);
    for (const raw of seenUrls) {
      expect(new URL(raw).pathname.startsWith("/api/auth/")).toBe(true);
    }
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
