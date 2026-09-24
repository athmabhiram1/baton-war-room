import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";

type SessionUser = { id?: unknown; name?: unknown; role?: unknown };

// GET /api/me → 200 {user:{id,name,role}} | 401. Identity comes only from the
// Neon Auth session (cookies) — no body, no userId parameter.
export async function GET(): Promise<NextResponse> {
  const h = await headers();
  // No credential presented at all — decidable locally, no backend needed.
  if (!h.get("cookie")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let result: { data?: { user?: SessionUser } | null };
  try {
    result = (await (auth.getSession as (args: unknown) => Promise<unknown>)({
      headers: h,
    })) as { data?: { user?: SessionUser } | null };
  } catch {
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  }
  const user = result?.data?.user;
  if (typeof user?.id !== "string" || !user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      name: typeof user.name === "string" ? user.name : null,
      role: typeof user.role === "string" ? user.role : null,
    },
  });
}
