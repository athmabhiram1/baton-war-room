// Probe stats for the Room SLO pane: p50/p95 over measured /api/query
// latencies. Nearest-rank percentiles over the sorted samples.

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("no samples");
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1];
}

export function p50p95(samples: number[]): { p50: number; p95: number } {
  if (samples.length === 0) throw new Error("no samples");
  const sorted = [...samples].sort((a, b) => a - b);
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
}
