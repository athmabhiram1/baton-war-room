import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";
import { parseSessionRole } from "@/lib/auth/roles";

function unavailable(): NextResponse {
  return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
}

function readSetCookies(res: Response): string[] {
  return typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
}

// POST /api/auth/login {name, role} → 200 {user:{id,name,role}} + session cookie.
// NOTE: only `name`/`role` are read — a `userId` in the body is never accepted;
// identity always comes from the Neon Auth session minted below.
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const rec = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  const role = parseSessionRole(rec.role);
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!role) return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  if (!process.env.NEON_AUTH_BASE_URL) return unavailable();

  const incoming = await headers();
  let upstream: Response;
  try {
    // Anonymous sign-in goes through the Neon Auth server instance's
    // passthrough handler (same proxy as app/api/auth/[...path]).
    const { POST: authPost } = auth.handler();
    const anonReq = new Request("https://neon-auth.local/sign-in/anonymous", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(incoming.get("cookie") ? { cookie: incoming.get("cookie") as string } : {}),
      },
      body: JSON.stringify({}),
    });
    upstream = await authPost(anonReq, { params: Promise.resolve({ path: ["sign-in", "anonymous"] }) });
  } catch {
    return unavailable();
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "login_failed" }, { status: 500 });
  }

  let id: string | null = null;
  try {
    const data = (await upstream.json()) as {
      user?: { id?: unknown };
      session?: { userId?: unknown };
    };
    if (typeof data?.user?.id === "string") id = data.user.id;
    else if (typeof data?.session?.userId === "string") id = data.session.userId;
  } catch {
    id = null;
  }
  if (!id) return NextResponse.json({ error: "login_failed" }, { status: 500 });

  // Best-effort display name on the fresh session; identity is the session id.
  try {
    const jar = readSetCookies(upstream)
      .map((c) => c.split(";")[0])
      .join("; ");
    await (auth.updateUser as (args: unknown) => Promise<unknown>)({
      headers: jar ? new Headers({ cookie: jar }) : new Headers(),
      body: { name },
    });
  } catch {
    // Display-name write is cosmetic — login already succeeded.
  }

  const res = NextResponse.json({ user: { id, name, role } });
  for (const c of readSetCookies(upstream)) res.headers.append("set-cookie", c);
  return res;
}
