// T5: POST /api/approvals — co-sign flow for high-risk actions.
// {roomId, action, payloadHash, step: propose|ratify|execute, approvalId?}
// Actor binding (Wave 3, docs/BACKEND_PLAN.md): the actor comes ONLY from the
// Neon Auth session (import { auth } from '@/lib/auth/server'). A body.actor
// that is present but mismatched is rejected with 403 + actor_spoof audit —
// it is never stamped as proposer/ratifier. Reads/writes are scoped by room
// membership (lib/rooms isMember) + tenant_id (lib/db RLS).
// propose → 201; ratify (2nd distinct human, same payloadHash, in-window) → 200;
// execute at 1/2 → 403 blocked, at 2/2 → 200 executed. Cross-room → 403 DENY
// + isolation_violation audit. Fail-closed on every mismatch.
// Legacy path: with no session context at all (no cookie), body.actor is
// honored so pre-auth (T5-era, BATON_EPHEMERAL) tests keep exercising the
// co-sign matrix. In production the edge gate (proxy.ts) redirects cookieless
// traffic before it reaches this route, so the legacy path is unreachable
// with a real user. Live sessions are deferred until NEON_AUTH_BASE_URL lands
// (mocked in tests).
// Docs: Next.js Route Handlers https://nextjs.org/docs/app/building-your-application/routing/route-handlers
import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import { isMember } from "@/lib/rooms";
import {
  ApprovalDenied,
  executeApproval,
  getApproval,
  proposeApproval,
  ratifyApproval,
  signaturesOf,
} from "@/lib/approvals";

type SessionUser = { id?: unknown; name?: unknown; role?: unknown };

function ephemeral(): boolean {
  return process.env.BATON_EPHEMERAL === "1";
}

async function auditLocal(roomId: string, event: string, details: unknown): Promise<void> {
  if (ephemeral()) return;
  try {
    const db = await import("@/lib/db");
    await db.logAudit({ roomId, event, details });
  } catch {
    // Gate decision already made; audit durability is the reconciler's job.
  }
}

type Actor =
  | { ok: true; actor: string; trusted: boolean }
  | { ok: false; response: NextResponse };

async function resolveActor(
  req: Request,
  roomId: string,
  bodyActor: unknown,
): Promise<Actor> {
  const claimed = typeof bodyActor === "string" && bodyActor ? bodyActor : null;

  let h: Headers | null = null;
  let headersAvailable = true;
  try {
    h = await headers();
  } catch {
    headersAvailable = false;
    h = null;
  }
  const cookie = h?.get("cookie") ?? req.headers.get("cookie");
  if (!cookie) {
    // No credential presented at all: 401 without touching auth (same as
    // /api/me, /api/rooms/*). Exception: the pre-auth harness where next/headers
    // itself is unavailable (unmocked) — legacy body.actor path, see header note.
    if (!headersAvailable && claimed) {
      return { ok: true, actor: claimed, trusted: false };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  let result: { data?: { user?: SessionUser } | null };
  try {
    result = (await (auth.getSession as (args: unknown) => Promise<unknown>)({
      headers: h ?? req.headers,
    })) as { data?: { user?: SessionUser } | null };
  } catch {
    if (ephemeral() && claimed) return { ok: true, actor: claimed, trusted: false };
    return {
      ok: false,
      response: NextResponse.json({ error: "auth_unavailable" }, { status: 503 }),
    };
  }
  const user = result?.data?.user;
  if (typeof user?.id !== "string" || !user.id) {
    if (ephemeral() && claimed) return { ok: true, actor: claimed, trusted: false };
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const actor = user.id;
  if (claimed && claimed !== actor) {
    await auditLocal(roomId, "actor_spoof", { claimed, actor });
    return {
      ok: false,
      response: NextResponse.json(
        { error: "body.actor rejected: identity comes from the session", event: "actor_spoof" },
        { status: 403 },
      ),
    };
  }
  try {
    if (!(await isMember(roomId, actor))) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "not a room member", event: "not_member" },
          { status: 403 },
        ),
      };
    }
  } catch {
    if (!ephemeral()) {
      return {
        ok: false,
        response: NextResponse.json({ error: "auth_unavailable" }, { status: 503 }),
      };
    }
  }
  return { ok: true, actor, trusted: true };
}

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

  const resolved = await resolveActor(req, roomId, b.actor);
  if (!resolved.ok) return resolved.response;
  const actor = resolved.actor;

  try {
    if (step === "propose") {
      const action = typeof b.action === "string" ? b.action : "";
      const payloadHash = typeof b.payloadHash === "string" ? b.payloadHash : "";
      const rec = await proposeApproval({ roomId, action, payloadHash, proposer: actor });
      return NextResponse.json(
        { id: rec.id, status: rec.status, signatures: "1/2", windowEndsAt: rec.windowEndsAt },
        { status: 201 },
      );
    }
    if (step === "ratify") {
      const id = typeof b.approvalId === "string" ? b.approvalId : "";
      const payloadHash = typeof b.payloadHash === "string" ? b.payloadHash : "";
      if (!id || !actor || !payloadHash) {
        return NextResponse.json({ error: "ratify requires approvalId, payloadHash and a session actor" }, { status: 400 });
      }
      const rec = await ratifyApproval({ id, roomId, ratifier: actor, payloadHash });
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
      const out: Record<string, unknown> = { error: e.message, event: e.event };
      const rec = typeof b.approvalId === "string" ? getApproval(b.approvalId) : undefined;
      if (rec && rec.roomId === roomId) out.signatures = signaturesOf(rec);
      else if (rec) out.signatures = "1/2";
      return NextResponse.json(out, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
