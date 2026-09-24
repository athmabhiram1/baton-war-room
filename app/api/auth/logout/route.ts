import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";

const SESSION_COOKIE = "__Secure-neon-auth.session_token";
const SESSION_DATA_COOKIE = "__Secure-neon-auth.local.session_data";

// POST /api/auth/logout → 200 {ok:true} + cleared session cookies.
export async function POST(): Promise<NextResponse> {
  if (!process.env.NEON_AUTH_BASE_URL) {
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  }
  const h = await headers();
  try {
    await (auth.signOut as (args: unknown) => Promise<unknown>)({ headers: h });
  } catch {
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(SESSION_DATA_COOKIE);
  return res;
}
