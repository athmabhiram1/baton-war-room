#!/usr/bin/env node
// 20 queries → latency-log.json + p50/p95 to stdout. SLO: p50 ≤800ms, p95 ≤2000ms (plan §2 S3).
import { writeFileSync } from "node:fs";

const BASE = process.env.LATENCY_BASE ?? "http://localhost:3000";
const QUERIES = [
  "SEV1 triage rollback",
  "database failover postgres",
  "cache stampede mitigation",
  "DNS incident runbook",
  "TLS expiry renewal",
  "queue backlog draining",
  "disk full node",
  "OOM pod recovery",
  "5xx spike response",
  "SLO burn rate",
  "auth outage mitigation",
  "rate limit tuning",
  "flag kill switch",
  "postmortem template",
  "escalation matrix",
  "deploy freeze procedure",
  "handoff template ACK",
  "comms status page",
  "sev2 triage degraded",
  "rollback runbook deploy",
];

async function probe() {
  const latencies = [];
  const results = [];
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    const t0 = Date.now();
    let ok = false;
    let body = null;
    let status = 0;
    try {
      const res = await fetch(`${BASE}/api/query`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-room-id": `war-probe-${i}` },
        body: JSON.stringify({ q, roomId: `war-probe-${i}` }),
      });
      status = res.status;
      body = await res.json().catch(() => null);
      ok = res.status === 200 && body?.citations?.length >= 2;
    } catch (e) {
      body = { error: String(e) };
    }
    const ms = Date.now() - t0;
    latencies.push(ms);
    results.push({ q, status, ok, ms, citations: body?.citations?.length ?? 0 });
    console.log(`[${i + 1}/20] "${q.slice(0, 32)}" -> ${status} ${ok ? "OK" : "FAIL"} ${ms}ms citations=${body?.citations?.length ?? 0}`);
  }
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const payload = { p50, p95, latencies, results, base: BASE, at: new Date().toISOString() };
  writeFileSync("latency-log.json", JSON.stringify(payload, null, 2));
  console.log(`\nLatency summary: p50=${p50}ms p95=${p95}ms (SLO p50≤800 p95≤2000)`);
  console.log(`Saved latency-log.json`);
  if (p50 > 800 || p95 > 2000) {
    console.warn(`WARN: SLO breach`);
  }
  // Also fetch /api/metrics for cross-check
  try {
    const m = await fetch(`${BASE}/api/metrics`).then((r) => r.json());
    console.log(`/api/metrics: p50=${m.p50} p95=${m.p95} docCount=${m.docCount} sampleSize=${m.sampleSize}`);
  } catch {}
}

probe().catch((e) => {
  console.error(e);
  process.exit(1);
});
