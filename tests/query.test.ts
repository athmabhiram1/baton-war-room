import { describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — rely on injected env */
}

import { POST } from "../app/api/query/route";

describe("POST /api/query (S1)", () => {
  it("returns 200 + ≥2 citations {id,score,text} + timeTakenInMs (RED before W2 GREEN)", async () => {
    const req = new Request("http://localhost/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: "SEV1 triage rollback deploy freeze" }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      citations: Array<{ id: string; score: number; text: string }>;
      timeTakenInMs: number;
    };
    expect(Array.isArray(body.citations)).toBe(true);
    expect(body.citations.length).toBeGreaterThanOrEqual(2);
    for (const c of body.citations) {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.score).toBe("number");
      expect(typeof c.text).toBe("string");
      expect(c.text.length).toBeGreaterThan(0);
    }
    expect(typeof body.timeTakenInMs).toBe("number");
    expect(body.timeTakenInMs).toBeGreaterThanOrEqual(0);
  });

  it("returns 400 when q is missing", async () => {
    const req = new Request("http://localhost/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });
});
