import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";
import { createRoom, getRoom, normalizeRoomCode, upsertMember } from "@/lib/rooms";

type SessionUser = { id?: unknown; name?: unknown; role?: unknown };

// POST /api/rooms/ensure {code} → 200 {room:{code}, member:{role}}.
// Auth required (401). Code is normalized (trim + lowercase) and must match
// war-<id> (400). Creates the room when absent, then upserts the caller's
// membership — re-ensure is idempotent. Join-by-code only: no codeless
// create path exists.
export async function POST(req: Request): Promise<NextResponse> {
  const h = await headers();
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

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const rec = (
    typeof body === "object" && body !== null ? body : {}
  ) as Record<string, unknown>;
  const code = normalizeRoomCode(rec.code);
  if (!code) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const role = typeof user.role === "string" && user.role ? user.role : "Observer";
  if (!(await getRoom(code))) {
    await createRoom(code, user.id);
  }
  const member = await upsertMember(code, user.id, role);
  return NextResponse.json({ room: { code }, member });
}
