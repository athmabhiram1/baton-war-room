import { describe, expect, it } from "vitest";

import { runProbe } from "@/lib/probe";

describe("runProbe", () => {
  it("collects one latency per query and reports p50/p95 over 20 samples", async () => {
    let calls = 0;
    const stats = await runProbe(20, async () => {
      calls += 1;
      return calls * 10;
    });
    expect(calls).toBe(20);
    expect(stats.p50).toBe(100);
    expect(stats.p95).toBe(190);
    expect(stats.n).toBe(20);
    expect(stats.samples).toHaveLength(20);
  });

  it("rejects zero queries", async () => {
    await expect(runProbe(0, async () => 1)).rejects.toThrow("no queries");
  });

  it("reports progress after each sample", async () => {
    const seen: number[] = [];
    await runProbe(
      3,
      async () => 5,
      (done) => {
        seen.push(done);
      },
    );
    expect(seen).toEqual([1, 2, 3]);
  });
});
