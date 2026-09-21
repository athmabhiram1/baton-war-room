// T5: /api/reconciler — durable HITL webhook resume target.
// GET → {intervalMs, lastRunAt, lastResult}; POST {now?} → one sweep pass
// (expire stale PENDING_HUMAN_APPROVAL, escalate retry-ceiling rows).
// Clients also poll approvals state every 5s (APPROVAL_POLL_MS fallback).
// Docs: Next.js Route Handlers https://nextjs.org/docs/app/building-your-application/routing/route-handlers
import { NextResponse } from "next/server";

import { reconcileOnce, reconcilerStatus } from "@/lib/reconciler";

export async function GET() {
  return NextResponse.json(reconcilerStatus());
}

export async function POST(req: Request) {
  let now = Date.now();
  try {
    const body = (await req.json()) as { now?: unknown };
    if (typeof body.now === "number" && Number.isFinite(body.now)) now = body.now;
  } catch {
    // Empty/webhook ping body → sweep at now.
  }
  const result = await reconcileOnce(now);
  return NextResponse.json({ ...result, ...reconcilerStatus() });
}
