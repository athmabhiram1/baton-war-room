import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Liveblocks } from "@liveblocks/node";

import { auth } from "@/lib/auth/server";
import { getMember, normalizeRoomCode } from "@/lib/rooms";

type SessionUser = { id?: unknown; name?: unknown; role?: unknown };

// POST /api/liveblocks-auth {room} → 200 token body | 401 unauth | 403 cross-room.
// T7 binding (docs/BACKEND_PLAN.md Wave 3): the token userId IS the Neon Auth
// session user id — the anonymous random-user path is deleted. Membership is
// room; cross-room attempts 403 + `isolation_violation` audit. Server-only:
// LIVEBLOCKS_SECRET_KEY never leaves the server; the browser only knows the
// authEndpoint URL (see Room.tsx).
// Docs: https://liveblocks.io/docs/api-reference/liveblocks-node
// Context7: /liveblocks/liveblocks — Next.js route handler access token impl.
export async function POST(req: Request) {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "liveblocks not configured" }, { status: 501 });
  }

  let room: unknown;
  try {
    room = (await req.json())?.room;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof room !== "string" || room.length === 0) {
    return NextResponse.json({ error: "room is required" }, { status: 400 });
  }
  const code = normalizeRoomCode(room);
  if (!code) {
    return NextResponse.json({ error: "room must match war-<id>" }, { status: 403 });
  }

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

  const member = await getMember(code, user.id);
  if (!member) {
    // Cross-room attempt: DENY + audit. Audit failure must not flip the
    // decision — fail-closed 403 either way.
    try {
      const { logAudit } = await import("@/lib/db");
      await logAudit({
        roomId: code,
        event: "isolation_violation",
        details: { userId: user.id, reason: "non_member" },
      });
    } catch {
      /* deny stands */
    }
    return NextResponse.json(
      { error: "forbidden", event: "isolation_violation" },
      { status: 403 },
    );
  }

  const name = typeof user.name === "string" && user.name ? user.name : user.id;
  const role =
    typeof member.role === "string" && member.role
      ? member.role
      : typeof user.role === "string" && user.role
        ? user.role
        : "Observer";

  const liveblocks = new Liveblocks({ secret });
  const session = liveblocks.prepareSession(user.id, {
    userInfo: { name, role },
  });
  session.allow(code, session.FULL_ACCESS);
  const { status, body } = await session.authorize();
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}
