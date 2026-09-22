#!/usr/bin/env node
// W4 tripwire: fail the build if usage caps are breached.
// Checks: Moss docCount via /api/metrics (M1: 1 index discipline, p95 SLO).
// Liveblocks collab-minute caps are dashboard-side; this gate covers what the
// app can observe. Non-zero exit = do not ship.
const BASE = process.env.BASE_URL ?? "http://localhost:3112";

const metrics = await (await fetch(`${BASE}/api/metrics`)).json();
const failures = [];
if (!(metrics.docCount > 0)) failures.push(`docCount=${metrics.docCount} (expected >0)`);
if (!(metrics.p95 <= 2000)) failures.push(`p95=${metrics.p95} (SLO ≤2000ms)`);
if (!(metrics.p50 <= 800)) failures.push(`p50=${metrics.p50} (SLO ≤800ms)`);
if (failures.length > 0) {
  console.error("TRIPWIRE FAIL:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`tripwire OK: docCount=${metrics.docCount} p50=${metrics.p50} p95=${metrics.p95}`);
