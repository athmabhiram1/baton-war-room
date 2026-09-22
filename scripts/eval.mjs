#!/usr/bin/env node
// S1/S2/S3 gate → docs/evidence/eval-report.json (T6 GREEN).
// BASE_URL defaults to local dev; set BASE_URL=https://baton-war-room.vercel.app for prod.
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3112";
const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, pass: true, detail });
  } catch (e) {
    results.push({ name, pass: false, detail: String(e?.message ?? e) });
  }
}
async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}
function assert(c, msg) {
  if (!c) throw new Error(msg);
}

await check("S1 query 200 + ≥2 citations + ms", async () => {
  const { status, json } = await post("/api/query", { q: "SEV1 triage rollback" });
  assert(status === 200, `status ${status}`);
  assert(json.citations?.length >= 2, "need ≥2 citations");
  assert(typeof json.timeTakenInMs === "number", "need timeTakenInMs");
  return `citations=${json.citations.length} ms=${json.timeTakenInMs}`;
});

await check("S2 fixture answers with zero live calls", async () => {
  const { status, json } = await post("/api/query?fixture=1", { q: "anything" });
  assert(status === 200, `status ${status}`);
  assert(json.fixture === true, "need fixture flag");
  assert(json.citations?.length >= 2, "need ≥2 canned citations");
  return `canned=${json.citations.length}`;
});

await check("S2 catchup recalls priority>3 decisions", async () => {
  const { status, json } = await post("/api/catchup", { roomId: "war-seed" });
  assert(status === 200, `status ${status}`);
  return `citations=${json.citations?.length ?? 0}`;
});

await check("S3 handoff 409 → ACK → 200", async () => {
  const room = `war-eval-${Date.now()}`;
  let r = await post("/api/handoff", { roomId: room, action: "initiate", actor: "arun" });
  assert(r.status === 200, `initiate ${r.status}`);
  r = await post("/api/handoff", { roomId: room, action: "close", actor: "arun" });
  assert(r.status === 409, `close-before-ack ${r.status}`);
  r = await post("/api/handoff", { roomId: room, action: "ack", actor: "priya" });
  assert(r.status === 200, `ack ${r.status}`);
  r = await post("/api/handoff", { roomId: room, action: "close", actor: "priya" });
  assert(r.status === 200, `close-after-ack ${r.status}`);
  return "409→ACK→200 ok";
});

await check("S3 cross-room ratify DENY + isolation_violation", async () => {
  const p = await post("/api/approvals", {
    roomId: "war-eval-a",
    action: "db-failover",
    payloadHash: "evalhash1",
    actor: "arun",
    step: "propose",
  });
  assert(p.status === 201, `propose ${p.status}`);
  const id = p.json.approval?.id ?? p.json.id ?? p.json.approvalId;
  assert(typeof id === "string" && id.length > 0, "need approval id");
  const r = await post("/api/approvals", {
    roomId: "war-eval-B",
    approvalId: id,
    actor: "priya",
    payloadHash: "evalhash1",
    step: "ratify",
  });
  assert(r.status === 403, `cross-room ${r.status}`);
  return "DENY ok";
});

await check("S3 metrics p50/p95 present", async () => {
  const res = await fetch(BASE + "/api/metrics");
  const json = await res.json();
  assert(res.status === 200, `status ${res.status}`);
  assert(typeof json.p50 === "number" && typeof json.p95 === "number", "need p50/p95");
  return `p50=${json.p50} p95=${json.p95}`;
});

const pass = results.every((r) => r.pass);
const report = { base: BASE, at: new Date().toISOString(), pass, results };
writeFileSync("docs/evidence/eval-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
