// T5: DB-contract predicates for gate decisions without DB I/O.
// approvalQuorum answers quorum from the authoritative in-memory approval
// store (mirrored to Postgres by lib/approvals.ts); missing/pending/expired
// rows are fail-closed false. Lets route/test code ask the contract without
// importing the Postgres client.

import { getApproval } from "./approvals";

export async function approvalQuorum(input: {
  id: string;
  roomId?: string;
  now?: number;
}): Promise<boolean> {
  const rec = getApproval(input.id);
  if (!rec) return false;
  if (input.roomId !== undefined && rec.roomId !== input.roomId) return false;
  const now = input.now ?? Date.now();
  if (now > rec.windowEndsAt) return false;
  return (
    rec.status === "ratified" &&
    rec.ratifier !== null &&
    rec.ratifier !== rec.proposer
  );
}
