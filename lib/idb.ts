// Fixture docs + outbox fallback (only if needed for ?offline replay, T6 owns).

export type FixtureDoc = { id: string; text: string };

export function fixtureDocs(): FixtureDoc[] {
  // TODO(T6): canned docs for ?fixture=1 (zero Moss calls).
  return [];
}

export function queueOffline(_op: unknown): void {
  // TODO(T6): idb/outbox replay. Stub.
}
