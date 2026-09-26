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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/login {name, role, email, password} → 200 {user:{id,name,role}}
// + session cookie. Managed Neon Auth offers Email only (no anonymous endpoint):
// sign-in/email first, sign-up/email fallback for unknown users — one call
// from the client's view. Verification is off by default in the Neon console,
// so both paths mint a session immediately.
// NOTE: only `name`/`role`/`email`/`password` are read — a `userId` in the body
// is never accepted; identity always comes from the Neon Auth session minted below.
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
  const email = typeof rec.email === "string" ? rec.email.trim() : "";
  const password = typeof rec.password === "string" ? rec.password : "";
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!role) return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  if (!password) return NextResponse.json({ error: "password_required" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  if (!process.env.NEON_AUTH_BASE_URL) return unavailable();

  const incoming = await headers();
  const cookie = incoming.get("cookie");
  // Email sign-in/sign-up go through the Neon Auth server instance's
  // passthrough handler (same proxy as app/api/auth/[...path]), so session
  // cookies flow back as Set-Cookie headers we forward verbatim.
  // Server API: auth.signIn.email / auth.signUp.email map to these paths
  // (Better Auth: sign-in/email, sign-up/email — see @neondatabase/auth
  // dist types-CnMXQlnQ API_ENDPOINTS, and
  // https://www.better-auth.com/docs/basic-usage#sign-in-with-email).
  async function proxy(path: string[], payload: unknown): Promise<Response> {
    const { POST: authPost } = auth.handler();
    const upstreamReq = new Request(`https://neon-auth.local/${path.join("/")}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(payload),
    });
    return authPost(upstreamReq, { params: Promise.resolve({ path }) });
  }

  let upstream: Response;
  try {
    upstream = await proxy(["sign-in", "email"], { email, password });
  } catch {
    return unavailable();
  }
  if (!upstream.ok) {
    // Better Auth answers unknown-user AND wrong-password alike with
    // INVALID_EMAIL_OR_PASSWORD, so any sign-in miss falls through to
    // sign-up: new address → account created; taken address → 401 below.
    try {
      upstream = await proxy(["sign-up", "email"], { name, email, password });
    } catch {
      return unavailable();
    }
    if (!upstream.ok) {
      let detail = "";
      try {
        detail = await upstream.text();
      } catch {
        detail = "";
      }
      if (
        upstream.status === 409 ||
        upstream.status === 422 ||
        /already|exists|taken|duplicate|in use/i.test(detail)
      ) {
        return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
      }
      return NextResponse.json({ error: "login_failed" }, { status: 500 });
    }
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

  // Best-effort display name + role on the fresh session; identity is the session id.
  try {
    const jar = readSetCookies(upstream)
      .map((c) => c.split(";")[0])
      .join("; ");
    await (auth.updateUser as (args: unknown) => Promise<unknown>)({
      headers: jar ? new Headers({ cookie: jar }) : new Headers(),
      body: { name, role },
    });
  } catch {
    // Display-name write is cosmetic — login already succeeded.
  }

  const res = NextResponse.json({ user: { id, name, role } });
  for (const c of readSetCookies(upstream)) res.headers.append("set-cookie", c);
  return res;
}
