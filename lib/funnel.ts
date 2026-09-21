// T5 governance: per-room single-writer funnel for pushIndex + audit writes.
// Scope is DELIBERATELY narrow: pushIndex and audit-log writes only.
// NEVER wrap CRDT/presence/Liveblocks realtime paths — the funnel serializes
// durable writes per roomId so checkpoints and audit rows stay ordered;
// realtime collaboration must stay lock-free.
// Pattern: per-key promise chain (standard async-mutex-by-key).

const chains = new Map<string, Promise<unknown>>();

/** Run fn after all prior funneled work for roomId settles. Never rejects. */
export function withFunnel<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(roomId) ?? Promise.resolve();
  const next = prior.then(fn, fn);
  // Keep the chain alive even when fn rejects; callers still see the error.
  chains.set(roomId, next.then(
    () => undefined,
    () => undefined,
  ));
  return next;
}

/** Test hook: drop all chains. */
export function resetFunnel(): void {
  chains.clear();
}

/** Test hook: how many rooms currently hold a chain. */
export function funnelDepth(): number {
  return chains.size;
}
