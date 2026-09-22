import { Liveblocks } from "@liveblocks/node";
import { NextResponse } from "next/server";

// POST /api/liveblocks-auth — prepareSession → allow(war-<id>) → authorize.
// Server-only: LIVEBLOCKS_SECRET_KEY never leaves the server; the browser
// only knows the authEndpoint URL (see Room.tsx).
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
  if (!/^war-[A-Za-z0-9_-]{1,64}$/.test(room)) {
    return NextResponse.json({ error: "room must match war-<id>" }, { status: 403 });
  }

  const liveblocks = new Liveblocks({ secret });
  const userId = `anon-${Math.random().toString(36).slice(2, 10)}`;
  const session = liveblocks.prepareSession(userId, {
    userInfo: { name: userId },
  });
  session.allow(room, session.FULL_ACCESS);
  const { status, body } = await session.authorize();
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}
