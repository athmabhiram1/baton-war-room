import { describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — rely on injected env */
}

import { GET } from "../app/api/metrics/route";

describe("GET /api/metrics", () => {
  it("reports p50/p95 + docCount (RED before W2 GREEN)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      p50: number;
      p95: number;
      docCount: number;
    };
    expect(typeof body.p50).toBe("number");
    expect(typeof body.p95).toBe("number");
    expect(typeof body.docCount).toBe("number");
    expect(body.docCount).toBeGreaterThanOrEqual(20);
    expect(body.p50).toBeGreaterThanOrEqual(0);
    expect(body.p95).toBeGreaterThanOrEqual(body.p50);
  });
});
