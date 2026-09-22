import { describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — rely on injected env */
}

import { POST } from "../app/api/query/route";
import { fixtureDocs } from "../lib/idb";

describe("?fixture=1 canned docs (S2)", () => {
  it("fixtureDocs returns ≥2 canned docs with id/text", () => {
    const docs = fixtureDocs();
    expect(docs.length).toBeGreaterThanOrEqual(2);
    for (const d of docs) {
      expect(typeof d.id).toBe("string");
      expect(d.id.length).toBeGreaterThan(0);
      expect(typeof d.text).toBe("string");
      expect(d.text.length).toBeGreaterThan(0);
    }
  });

  it("POST /api/query?fixture=1 answers 200 with canned citations and zero Moss calls", async () => {
    // Prove zero Moss calls: blank the Moss credentials — fixture path must
    // return before any session() call, so this still passes.
    const savedId = process.env.MOSS_PROJECT_ID;
    const savedKey = process.env.MOSS_PROJECT_KEY;
    delete process.env.MOSS_PROJECT_ID;
    delete process.env.MOSS_PROJECT_KEY;
    try {
      const req = new Request("http://localhost/api/query?fixture=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: "SEV1 triage" }),
      });
      const res = await POST(req as unknown as Parameters<typeof POST>[0]);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        citations: Array<{ id: string; score: number; text: string }>;
        timeTakenInMs: number;
        fixture: boolean;
      };
      expect(body.fixture).toBe(true);
      expect(body.citations.length).toBeGreaterThanOrEqual(2);
      for (const c of body.citations) {
        expect(c.id.startsWith("fixture-")).toBe(true);
      }
    } finally {
      if (savedId !== undefined) process.env.MOSS_PROJECT_ID = savedId;
      if (savedKey !== undefined) process.env.MOSS_PROJECT_KEY = savedKey;
    }
  });
});
