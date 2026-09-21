// T5: POST /api/approvals — co-sign flow for high-risk actions.
// {roomId, action, payloadHash, actor, step: propose|ratify|execute, approvalId?}
// propose → 201; ratify (2nd distinct human, same payloadHash, in-window) → 200;
// execute at 1/2 → 403 blocked, at 2/2 → 200 executed. Cross-room → 403 DENY
// + isolation_violation audit. Fail-closed on every mismatch.
// Docs: Next.js Route Handlers https://nextjs.org/docs/app/building-your-application/routing/route-handlers
import { NextResponse } from "next/server";

import {
  ApprovalDenied,
  executeApproval,
  getApproval,
  proposeApproval,
  ratifyApproval,
  signaturesOf,
} from "@/lib/approvals";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const b = body as {
    roomId?: unknown;
    action?: unknown;
    payloadHash?: unknown;
    actor?: unknown;
    step?: unknown;
    approvalId?: unknown;
  };
  const roomId =
    (typeof b.roomId === "string" && b.roomId) ||
    req.headers.get("x-room-id") ||
    req.headers.get("x-war-room-id") ||
    "";
  if (!roomId) return NextResponse.json({ error: "missing roomId" }, { status: 400 });
  const step = b.step as string;

  try {
    if (step === "propose") {
      const action = typeof b.action === "string" ? b.action : "";
      const payloadHash = typeof b.payloadHash === "string" ? b.payloadHash : "";
      const proposer = typeof b.actor === "string" && b.actor ? b.actor : "";
      const rec = await proposeApproval({ roomId, action, payloadHash, proposer });
      return NextResponse.json(
        { id: rec.id, status: rec.status, signatures: "1/2", windowEndsAt: rec.windowEndsAt },
        { status: 201 },
      );
    }
    if (step === "ratify") {
      const id = typeof b.approvalId === "string" ? b.approvalId : "";
      const ratifier = typeof b.actor === "string" && b.actor ? b.actor : "";
      const payloadHash = typeof b.payloadHash === "string" ? b.payloadHash : "";
      if (!id || !ratifier || !payloadHash) {
        return NextResponse.json({ error: "ratify requires approvalId, actor, payloadHash" }, { status: 400 });
      }
      const rec = await ratifyApproval({ id, roomId, ratifier, payloadHash });
      return NextResponse.json({ id: rec.id, status: rec.status, signatures: signaturesOf(rec) });
    }
    if (step === "execute") {
      const id = typeof b.approvalId === "string" ? b.approvalId : "";
      if (!id) return NextResponse.json({ error: "execute requires approvalId" }, { status: 400 });
      const rec = await executeApproval({ id, roomId });
      return NextResponse.json({ id: rec.id, status: rec.status, signatures: "2/2", executed: true });
    }
    if (step === "status") {
      const id = typeof b.approvalId === "string" ? b.approvalId : "";
      const rec = id ? getApproval(id) : undefined;
      if (!rec || rec.roomId !== roomId) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json({
        id: rec.id,
        status: rec.status,
        signatures: signaturesOf(rec),
        windowEndsAt: rec.windowEndsAt,
      });
    }
    return NextResponse.json({ error: "step must be propose|ratify|execute|status" }, { status: 400 });
  } catch (e) {
    if (e instanceof ApprovalDenied) {
      const body: Record<string, unknown> = { error: e.message, event: e.event };
      const rec = typeof b.approvalId === "string" ? getApproval(b.approvalId) : undefined;
      if (rec && rec.roomId === roomId) body.signatures = signaturesOf(rec);
      else if (rec) body.signatures = "1/2";
      return NextResponse.json(body, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
