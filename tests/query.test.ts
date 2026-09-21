import { describe, it } from "vitest";

// S1 contract: POST /api/query {q} → 200 + ≥2 citations {id,score,text} + timeTakenInMs.
// Owned by T2 (W2). Skipped until Moss is provisioned — do not delete.
describe.skip("POST /api/query (S1)", () => {
  it("returns ≥2 citations with timeTakenInMs", () => {});
});
