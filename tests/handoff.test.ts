import { describe, it } from "vitest";

// Handoff gates: close with PENDING_HANDOFF + no ACK → 409; after ACK → 200.
// Must run in <2min via short overrides (CO_SIGN_WINDOW_MS=60000,
// RECONCILER_INTERVAL_MS=5000). Owned by T5 (required). Skipped — do not delete.
describe.skip("POST /api/handoff (409→ACK→200)", () => {
  it("409s close on PENDING_HANDOFF without ACK, 200s after ACK", () => {});
});
