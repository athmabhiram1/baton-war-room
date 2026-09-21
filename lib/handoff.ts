// T5 governance: handoff ownership gate (plan §2 S3, §4 T5).
// POST /api/handoff {roomId, action: initiate|ack|close, actor}.
// initiate → PENDING_HANDOFF row; close while pending+unacked → 409;
// after ACK → 200. Successor resumes via logbook + push_index checkpoint.
//
// Store: module-scope per-room map (authoritative for gate decisions) with a
// best-effort Postgres mirror (outbox kind PENDING_HANDOFF/handoff.acked +
// audit rows via lib/db.ts). BATON_EPHEMERAL=1 skips the DB mirror so unit
// tests run with zero I/O in milliseconds.

export type HandoffState = "live" | "pending" | "acked";

export type HandoffRecord = {
  roomId: string;
  state: HandoffState;
  initiatedBy: string | null;
  initiatedAt: number | null;
  ackedBy: string | null;
  ackedAt: number | null;
  checkpoint: string | null;
};

export class HandoffBlocked extends Error {
  readonly code = "PENDING_HANDOFF";
  constructor(roomId: string) {
    super(`close blocked: room ${roomId} has PENDING_HANDOFF with no ACK (409)`);
  }
}

const store = new Map<string, HandoffRecord>();

function blank(roomId: string): HandoffRecord {
  return {
    roomId,
    state: "live",
    initiatedBy: null,
    initiatedAt: null,
    ackedBy: null,
    ackedAt: null,
    checkpoint: null,
  };
}

export function getHandoff(roomId: string): HandoffRecord {
  return store.get(roomId) ?? blank(roomId);
}

/** Test hook: drop all handoff state. */
export function resetHandoffs(): void {
  store.clear();
}

function ephemeral(): boolean {
  return process.env.BATON_EPHEMERAL === "1";
}

async function mirrorToDb(kind: string, rec: HandoffRecord): Promise<void> {
  if (ephemeral()) return;
  try {
    const db = await import("./db");
    await db.enqueueOutbox({
      roomId: rec.roomId,
      kind,
      payload: {
        state: rec.state,
        initiatedBy: rec.initiatedBy,
        ackedBy: rec.ackedBy,
        checkpoint: rec.checkpoint,
      },
    });
    await db.logAudit({ roomId: rec.roomId, event: kind, details: { actor: rec.ackedBy ?? rec.initiatedBy } });
  } catch {
    // In-memory gate stays authoritative; durability is best-effort here and
    // reconciled by lib/reconciler.ts.
  }
}

function checkpointFor(roomId: string, at: number): string {
  let h = 0;
  const s = `${roomId}:${at}`;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `ck_${h.toString(16).padStart(4, "0")}`;
}

export async function initiateHandoff(roomId: string, actor: string): Promise<HandoffRecord> {
  const now = Date.now();
  const rec: HandoffRecord = {
    roomId,
    state: "pending",
    initiatedBy: actor,
    initiatedAt: now,
    ackedBy: null,
    ackedAt: null,
    checkpoint: checkpointFor(roomId, now),
  };
  store.set(roomId, rec);
  await mirrorToDb("PENDING_HANDOFF", rec);
  return rec;
}

export async function ackHandoff(roomId: string, actor: string): Promise<HandoffRecord> {
  const cur = getHandoff(roomId);
  const rec: HandoffRecord = {
    ...cur,
    state: "acked",
    ackedBy: actor,
    ackedAt: Date.now(),
    checkpoint: cur.checkpoint ?? checkpointFor(roomId, Date.now()),
  };
  store.set(roomId, rec);
  await mirrorToDb("handoff.acked", rec);
  return rec;
}

/**
 * Close gate: throws HandoffBlocked (→ HTTP 409) while PENDING_HANDOFF has
 * no ACK; resolves the sealed record after ACK (→ HTTP 200).
 */
export async function closeRoom(roomId: string): Promise<HandoffRecord> {
  const cur = getHandoff(roomId);
  if (cur.state === "pending") throw new HandoffBlocked(roomId);
  await mirrorToDb("room.closed", cur);
  return cur;
}
