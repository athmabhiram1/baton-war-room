// T5 governance: durable co-sign approvals (plan §5, §4 T5).
// High-risk actions need 2 distinct humans on the same payloadHash inside
// CO_SIGN_WINDOW_MS (default 600000, test override 60000), fail-closed.
// PENDING_HUMAN_APPROVAL lives as a Postgres row (lib/db.ts approvals +
// outbox mirror, best-effort) with this module-scope store authoritative for
// gate decisions. BATON_EPHEMERAL=1 skips the DB mirror (unit tests).

import { coSignWindowMs } from "./cosign";

export type ApprovalStatus = "pending" | "ratified" | "executed" | "expired" | "escalated";

export type ApprovalRecord = {
  id: string;
  roomId: string;
  action: string;
  payloadHash: string;
  proposer: string;
  ratifier: string | null;
  status: ApprovalStatus;
  windowEndsAt: number;
  updatedAt: number;
  attempts: number;
};

export class ApprovalDenied extends Error {
  readonly statusCode: number;
  readonly event: string;
  constructor(message: string, opts?: { statusCode?: number; event?: string }) {
    super(message);
    this.statusCode = opts?.statusCode ?? 403;
    this.event = opts?.event ?? "approval_denied";
  }
}

const store = new Map<string, ApprovalRecord>();
let seq = 0;

/** Test hook: drop all approval state. */
export function resetApprovals(): void {
  store.clear();
  seq = 0;
}

function ephemeral(): boolean {
  return process.env.BATON_EPHEMERAL === "1";
}

async function audit(roomId: string, event: string, details: unknown): Promise<void> {
  if (ephemeral()) return;
  try {
    const db = await import("./db");
    await db.logAudit({ roomId, event, details });
  } catch {
    // Gate decision already made; audit durability is the reconciler's job.
  }
}

async function mirrorProposal(rec: ApprovalRecord): Promise<void> {
  if (ephemeral()) return;
  try {
    const db = await import("./db");
    await db.requestApproval({
      roomId: rec.roomId,
      action: rec.action,
      payloadHash: rec.payloadHash,
      proposer: rec.proposer,
      windowEndsAt: new Date(rec.windowEndsAt),
    });
    await db.enqueueOutbox({
      roomId: rec.roomId,
      kind: "PENDING_HUMAN_APPROVAL",
      payload: { approvalId: rec.id, action: rec.action, payloadHash: rec.payloadHash },
    });
  } catch {
    // In-memory gate stays authoritative; reconciler backfills durability.
  }
}

/** High-risk actions require co-sign quorum; everything else is single-actor. */
export function isHighRisk(action: string): boolean {
  const a = action.toLowerCase();
  return (
    a.startsWith("rollback") ||
    a.startsWith("deploy") ||
    a.startsWith("close") ||
    a.startsWith("handoff") ||
    a.startsWith("failover") ||
    a === "execute"
  );
}

export async function proposeApproval(input: {
  roomId: string;
  action: string;
  payloadHash: string;
  proposer: string;
}): Promise<ApprovalRecord> {
  if (!input.roomId || !input.action || !input.payloadHash || !input.proposer) {
    throw new ApprovalDenied("propose requires roomId, action, payloadHash, proposer", { statusCode: 400 });
  }
  const now = Date.now();
  const rec: ApprovalRecord = {
    id: `appr_${now.toString(36)}_${(seq += 1)}`,
    roomId: input.roomId,
    action: input.action,
    payloadHash: input.payloadHash,
    proposer: input.proposer,
    ratifier: null,
    status: "pending",
    windowEndsAt: now + coSignWindowMs(),
    updatedAt: now,
    attempts: 0,
  };
  store.set(rec.id, rec);
  await mirrorProposal(rec);
  return rec;
}

export function getApproval(id: string): ApprovalRecord | undefined {
  return store.get(id);
}

export function signaturesOf(rec: ApprovalRecord): "0/2" | "1/2" | "2/2" {
  if (rec.ratifier && rec.ratifier !== rec.proposer) return "2/2";
  return "1/2";
}

/**
 * Second human ratifies. Fail-closed: same-human, payloadHash mismatch,
 * expired window, wrong room, or non-pending status all DENY (403) and audit
 * cross-room attempts as isolation_violation.
 */
export async function ratifyApproval(input: {
  id: string;
  roomId: string;
  ratifier: string;
  payloadHash: string;
  now?: number;
}): Promise<ApprovalRecord> {
  const rec = store.get(input.id);
  const now = input.now ?? Date.now();
  if (!rec) throw new ApprovalDenied("approval not found", { statusCode: 404 });
  if (rec.roomId !== input.roomId) {
    await audit(input.roomId, "isolation_violation", {
      reason: "cross-room-approval",
      approvalId: input.id,
      ownerRoom: rec.roomId,
    });
    throw new ApprovalDenied("cross-room approval DENY", { statusCode: 403, event: "isolation_violation" });
  }
  if (rec.status !== "pending") {
    throw new ApprovalDenied(`approval is ${rec.status}, not pending`, { statusCode: 409 });
  }
  if (now > rec.windowEndsAt) {
    rec.status = "expired";
    rec.updatedAt = now;
    await audit(rec.roomId, "approval_expired", { approvalId: rec.id });
    throw new ApprovalDenied("co-sign window expired (fail-closed)", { statusCode: 403 });
  }
  if (input.ratifier === rec.proposer) {
    throw new ApprovalDenied("ratifier must differ from proposer (fail-closed)", { statusCode: 403 });
  }
  if (input.payloadHash !== rec.payloadHash) {
    throw new ApprovalDenied("payloadHash mismatch (fail-closed)", { statusCode: 403 });
  }
  rec.ratifier = input.ratifier;
  rec.status = "ratified";
  rec.updatedAt = now;
  await audit(rec.roomId, "approval_ratified", {
    approvalId: rec.id,
    signatures: "2/2",
    ratifier: input.ratifier,
  });
  return rec;
}

/**
 * Execute a high-risk action: 2/2 quorum inside the window executes;
 * 1/2 is blocked (403) — the curl matrix asserts exactly this.
 */
export async function executeApproval(input: {
  id: string;
  roomId: string;
  now?: number;
}): Promise<ApprovalRecord> {
  const rec = store.get(input.id);
  const now = input.now ?? Date.now();
  if (!rec) throw new ApprovalDenied("approval not found", { statusCode: 404 });
  if (rec.roomId !== input.roomId) {
    await audit(input.roomId, "isolation_violation", {
      reason: "cross-room-execute",
      approvalId: input.id,
      ownerRoom: rec.roomId,
    });
    throw new ApprovalDenied("cross-room execute DENY", { statusCode: 403, event: "isolation_violation" });
  }
  if (rec.status === "pending") {
    throw new ApprovalDenied("co-sign quorum not met (1/2) — blocked", { statusCode: 403 });
  }
  if (rec.status !== "ratified") {
    throw new ApprovalDenied(`approval is ${rec.status}`, { statusCode: 409 });
  }
  if (now > rec.windowEndsAt) {
    rec.status = "expired";
    rec.updatedAt = now;
    throw new ApprovalDenied("co-sign window expired before execute (fail-closed)", { statusCode: 403 });
  }
  if (!rec.ratifier || rec.ratifier === rec.proposer) {
    throw new ApprovalDenied("quorum invalid (fail-closed)", { statusCode: 403 });
  }
  rec.status = "executed";
  rec.updatedAt = now;
  await audit(rec.roomId, "approval_executed", { approvalId: rec.id, signatures: "2/2" });
  return rec;
}

/**
 * Reconciler sweep (honors RECONCILER_INTERVAL_MS at the caller): expire
 * stale pending approvals past their window; escalate rows whose attempts
 * hit the retry ceiling. Returns counts for the webhook/curl evidence.
 */
export async function sweepStaleApprovals(now: number = Date.now()): Promise<{
  expired: string[];
  escalated: string[];
}> {
  const expired: string[] = [];
  const escalated: string[] = [];
  for (const rec of store.values()) {
    if (rec.status === "pending" && now > rec.windowEndsAt) {
      rec.status = "expired";
      rec.updatedAt = now;
      expired.push(rec.id);
      await audit(rec.roomId, "approval_expired", { approvalId: rec.id, by: "reconciler" });
    } else if ((rec.status === "pending" || rec.status === "ratified") && rec.attempts >= 3) {
      rec.status = "escalated";
      rec.updatedAt = now;
      escalated.push(rec.id);
      await audit(rec.roomId, "approval_escalated", { approvalId: rec.id, attempts: rec.attempts });
    }
  }
  return { expired, escalated };
}

/** Test hook: read all approvals (isolation assertions). */
export function listApprovals(): ApprovalRecord[] {
  return [...store.values()];
}
