import { describe, expect, it } from "vitest";

import { p50p95 } from "@/lib/probe-stats";

describe("p50p95", () => {
  it("computes p50/p95 from 20 probe samples", () => {
    const samples = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    expect(p50p95(samples)).toEqual({ p50: 100, p95: 190 });
  });

  it("rejects empty samples", () => {
    expect(() => p50p95([])).toThrow("no samples");
  });
});
