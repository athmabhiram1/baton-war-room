// T5: POST /api/handoff {roomId, action: initiate|ack|close, actor}.
// initiate → PENDING_HANDOFF row; close while pending+unacked → 409;
// after ACK → 200 with logbook + push_index checkpoint for the successor.
// Docs: Next.js Route Handlers https://nextjs.org/docs/app/building-your-application/routing/route-handlers
import { NextResponse } from "next/server";

import { ackHandoff, closeRoom, getHandoff, HandoffBlocked, initiateHandoff } from "@/lib/handoff";
import { withFunnel } from "@/lib/funnel";

type Action = "initiate" | "ack" | "close";

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
  const actor = typeof b.actor === "string" && b.actor ? b.actor : "unknown";
  if (!roomId) return NextResponse.json({ error: "missing roomId" }, { status: 400 });
  if (action !== "initiate" && action !== "ack" && action !== "close") {
    return NextResponse.json({ error: "action must be initiate|ack|close" }, { status: 400 });
  }

  try {
    if (action === "initiate") {
      const rec = await initiateHandoff(roomId, actor);
      return NextResponse.json({ state: rec.state, checkpoint: rec.checkpoint, initiatedBy: rec.initiatedBy });
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
