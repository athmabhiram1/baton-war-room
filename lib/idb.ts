// Fixture docs + outbox fallback (?offline replay, T6).
// Fixture docs are canned, deterministic, and cost zero Moss calls.

export type FixtureDoc = { id: string; text: string };

const CANNED: FixtureDoc[] = [
  {
    id: "fixture-sev1-triage",
    text: "SEV1 triage: page the incident commander, freeze deploys, open the war-room, post the first status update within 5 minutes. Confirm blast radius before any mitigation.",
  },
  {
    id: "fixture-rollback",
    text: "Rollback runbook: identify the last known-good deploy, flip the release flag or redeploy the pinned artifact, verify health checks pass, then announce all-clear in the war-room feed.",
  },
  {
    id: "fixture-handoff",
    text: "Handoff template: outgoing states what changed, what is suspected, and what is next; incoming ACKs explicitly. Close returns 409 until the ACK lands.",
  },
];

export function fixtureDocs(): FixtureDoc[] {
  return CANNED.map((d) => ({ ...d }));
}

// Minimal offline outbox: queue ops while offline, replay in order on reconnect.
const offlineQueue: unknown[] = [];

export function queueOffline(op: unknown): number {
  offlineQueue.push(op);
  return offlineQueue.length;
}

export function replayOffline(): unknown[] {
  return offlineQueue.splice(0, offlineQueue.length);
}
