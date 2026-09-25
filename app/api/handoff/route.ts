// T5: POST /api/handoff {roomId, action: initiate|ack|close}.
// T6: actor is server-bound — derived ONLY from the Neon Auth session.
// A non-empty body.actor that matches neither the session name nor id is a
// spoof → 403 + actor_spoof audit. No cookie / no session → 401.
// initiate → PENDING_HANDOFF row; close while pending+unacked → 409;
// after ACK → 200 with logbook + push_index checkpoint for the successor.
// Docs: Next.js Route Handlers https://nextjs.org/docs/app/building-your-application/routing/route-handlers
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { ackHandoff, closeRoom, getHandoff, HandoffBlocked, initiateHandoff } from "@/lib/handoff";
import { withFunnel } from "@/lib/funnel";
import { auth } from "@/lib/auth/server";

type SessionUser = { id?: unknown; name?: unknown; role?: unknown };

// Best-effort spoof audit (skipped in BATON_EPHEMERAL unit tests; the 403
// itself is the gate, durability reconciles via lib/reconciler.ts).
async function auditSpoof(roomId: string, claimed: string, actual: string): Promise<void> {
  if (process.env.BATON_EPHEMERAL === "1") return;
  try {
    const db = await import("@/lib/db");
    await db.logAudit({ roomId, event: "actor_spoof", details: { claimed, actual } });
  } catch {
    // Gate stays authoritative; audit is best-effort.
  }
}

type Action = "initiate" | "ack" | "close";

// Ops-panel status read: GET /api/handoff?roomId=… returns the live record
// (state, initiatedAt, ackedBy, checkpoint). Read-only; POST gates untouched.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const roomId =
    url.searchParams.get("roomId") ||
    req.headers.get("x-room-id") ||
    req.headers.get("x-war-room-id") ||
    "";
  if (!roomId) return NextResponse.json({ error: "missing roomId" }, { status: 400 });
  return NextResponse.json(getHandoff(roomId));
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const b = body as { roomId?: unknown; action?: unknown; actor?: unknown };
  const roomId =
    (typeof b.roomId === "string" && b.roomId) ||
    req.headers.get("x-room-id") ||
    req.headers.get("x-war-room-id") ||
    "";
  const action = b.action as Action;
  if (!roomId) return NextResponse.json({ error: "missing roomId" }, { status: 400 });
  if (action !== "initiate" && action !== "ack" && action !== "close") {
    return NextResponse.json({ error: "action must be initiate|ack|close" }, { status: 400 });
  }

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
  const actor = typeof user.name === "string" && user.name ? user.name : user.id;
  const claimed = typeof b.actor === "string" && b.actor ? b.actor : null;
  if (claimed !== null && claimed !== actor && claimed !== user.id) {
    await auditSpoof(roomId, claimed, actor);
    return NextResponse.json({ error: "actor_spoof" }, { status: 403 });
  }

  try {
    if (action === "initiate") {
      const rec = await initiateHandoff(roomId, actor);
      return NextResponse.json({
        state: rec.state,
        checkpoint: rec.checkpoint,
        initiatedBy: rec.initiatedBy,
        initiatedAt: rec.initiatedAt,
      });
    }
    if (action === "ack") {
      // Successor resume runs inside the funnel: pushIndex checkpoint +
      // logbook recall stay single-writer per room (never CRDT/presence).
      const rec = await withFunnel(roomId, () => ackHandoff(roomId, actor));
      let resume: { checkpoint: string | null; pushIndex: unknown; logbook: unknown } = {
        checkpoint: rec.checkpoint,
        pushIndex: null,
        logbook: null,
      };
      try {
        const { session } = await import("@/lib/moss-server");
        const s = await session(roomId);
        const [pushIndex, recall] = await Promise.all([
          s.pushIndex().catch(() => null),
          s.query("high priority decision incident handoff", { topK: 5, alpha: 0.8 }).catch(() => null),
        ]);
        resume = {
          checkpoint: rec.checkpoint,
          pushIndex,
          logbook: recall ? recall.docs.slice(0, 5).map((d) => ({ id: d.id, score: d.score })) : [],
        };
      } catch {
        // Resume metadata is best-effort; the ACK itself is durable.
      }
      return NextResponse.json({ state: rec.state, checkpoint: rec.checkpoint, ackedBy: rec.ackedBy, resume });
    }
    const rec = await closeRoom(roomId);
    return NextResponse.json({ sealed: true, state: rec.state, checkpoint: rec.checkpoint });
  } catch (e) {
    if (e instanceof HandoffBlocked) {
      const cur = getHandoff(roomId);
      return NextResponse.json(
        { error: e.code, state: cur.state, checkpoint: cur.checkpoint },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
