// T5 governance: durable HITL reconciler (plan §5: PENDING_HUMAN_APPROVAL =
// Postgres row + reconciler 5min + webhook resume + 5s poll fallback).
// The interval honors RECONCILER_INTERVAL_MS (default 300000, test 5000).
// Webhook resume = POST /api/reconciler (or ratify on /api/approvals);
// clients additionally poll approvals state every APPROVAL_POLL_MS (5s).

import { reconcilerIntervalMs } from "./cosign";
import { sweepStaleApprovals } from "./approvals";
import { runWithRetry, RETRY_MAX_ATTEMPTS } from "./retry";

export { reconcilerIntervalMs, RETRY_MAX_ATTEMPTS };

let lastRunAt: number | null = null;
let lastResult: { expired: string[]; escalated: string[] } | null = null;

export function reconcilerStatus(): {
  intervalMs: number;
  lastRunAt: number | null;
  lastResult: { expired: string[]; escalated: string[] } | null;
} {
  return { intervalMs: reconcilerIntervalMs(), lastRunAt, lastResult };
}

/**
 * One reconciler pass: sweep stale approvals (expire past-window pending,
 * escalate retry-ceiling rows). Each room's sweep runs inside the funnel so
 * pushIndex + audit writes stay single-writer per room.
 */
export async function reconcileOnce(now: number = Date.now()): Promise<{
  expired: string[];
  escalated: string[];
}> {
  const { withFunnel } = await import("./funnel");
  const outcome = await runWithRetry(
    async () => withFunnel("__reconciler__", () => sweepStaleApprovals(now)),
    {
      maxAttempts: RETRY_MAX_ATTEMPTS,
      onExhausted: async ({ attempts, lastError }) => {
        try {
          const db = await import("./db");
          await db.logAudit({
            roomId: "__reconciler__",
            event: "reconciler_escalated",
            details: { attempts, lastError },
          });
        } catch {
          // Escalation recorded in-memory via lastResult below.
        }
      },
    },
  );
  const result =
    outcome.status === "ok" ? outcome.value : { expired: [], escalated: [`escalated:${outcome.lastError}`] };
  lastRunAt = Date.now();
  lastResult = result;
  return result;
}

/** Test hook: reset reconciler memory. */
export function resetReconciler(): void {
  lastRunAt = null;
  lastResult = null;
}
