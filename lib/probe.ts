// Client-side 20-query probe runner: collects one measured latency per
// query via the injected query fn (Room passes a real POST /api/query
// fetch), then reports nearest-rank p50/p95. No canned numbers — every
// sample comes from the query fn.

import { p50p95 } from "./probe-stats";

export type ProbeStats = { p50: number; p95: number; n: number; samples: number[] };

export async function runProbe(
  count: number,
  query: () => Promise<number>,
  onSample?: (done: number) => void,
): Promise<ProbeStats> {
  if (count <= 0) throw new Error("no queries");
  const samples: number[] = [];
  for (let i = 0; i < count; i += 1) {
    samples.push(await query());
    onSample?.(samples.length);
  }
  const { p50, p95 } = p50p95(samples);
  return { p50, p95, n: samples.length, samples };
}
