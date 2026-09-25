import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";
import { getRoom, normalizeRoomCode, upsertMember } from "@/lib/rooms";

type SessionUser = { id?: unknown; name?: unknown; role?: unknown };

// POST /api/rooms/join {code} → 200 {room:{code}, member:{role}}.
// Auth required (401). Unknown code → 404 (never creates). Existing code →
// upserts the caller's membership, idempotent 200.
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

  if (!(await getRoom(code))) {
    return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  }
  const role = typeof user.role === "string" && user.role ? user.role : "Observer";
  const member = await upsertMember(code, user.id, role);
  return NextResponse.json({ room: { code }, member });
}
