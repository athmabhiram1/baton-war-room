// T5 governance: worker-action retry, max 3 attempts → ESCALATED + audit.
// Pure helper — the caller supplies the action and the audit sink so unit
// tests run with zero I/O and production wires the Postgres audit row.

export const RETRY_MAX_ATTEMPTS = 3;

export type RetryOutcome<T> =
  | { status: "ok"; attempts: number; value: T }
  | { status: "escalated"; attempts: number; lastError: string };

export async function runWithRetry<T>(
  action: (attempt: number) => Promise<T>,
  opts?: {
    maxAttempts?: number;
    onExhausted?: (info: { attempts: number; lastError: string }) => Promise<unknown>;
  },
): Promise<RetryOutcome<T>> {
  const maxAttempts = opts?.maxAttempts ?? RETRY_MAX_ATTEMPTS;
  let lastError = "unknown";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await action(attempt);
      return { status: "ok", attempts: attempt, value };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  // Exhausted: ESCALATED status + audit row via the caller's sink.
  try {
    await opts?.onExhausted?.({ attempts: maxAttempts, lastError });
  } catch {
    // The escalation itself is recorded; a failing sink must not throw.
  }
  return { status: "escalated", attempts: maxAttempts, lastError };
}
