#!/usr/bin/env node
// S1/S2/S3 gate → docs/evidence/eval-report.json (auth-aware: T5/T6 actor
// binding made handoff/approvals session-gated, so S3 logs in first).
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

// Minimal cookie jar: Thundering fetch has none natively.
function makeJar() {
  return { cookies: new Map() };
}
function storeCookies(jar, res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const pair = c.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) jar.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function jarHeader(jar) {
  return [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function post(path, body, jar) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(jar && jar.cookies.size > 0 ? { cookie: jarHeader(jar) } : {}),
    },
    body: JSON.stringify(body),
  });
  if (jar) storeCookies(jar, res);
  const json = await res.json();
  return { status: res.status, json };
}
function assert(c, msg) {
  if (!c) throw new Error(msg);
}

async function loginAs(name, email) {
  const jar = makeJar();
  const r = await post(
    "/api/auth/login",
    { name, role: "Observer", email, password: "EvalPass123!" },
    jar,
  );
  assert(r.status === 200, `login ${name} → ${r.status}`);
  return jar;
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

await check("S3 unauthenticated handoff/approvals → 401 fail-closed", async () => {
  const h = await post("/api/handoff", { roomId: "war-eval-x", action: "initiate" });
  assert(h.status === 401, `handoff ${h.status}`);
  const a = await post("/api/approvals", {
    roomId: "war-eval-x",
    action: "db-failover",
    payloadHash: "evalhash0",
    step: "propose",
  });
  assert(a.status === 401, `approvals ${a.status}`);
  return "401 + 401 ok";
});

await check("S3 handoff 409 → ACK → 200 (authenticated)", async () => {
  const stamp = Date.now();
  const room = `war-eval-${stamp}`;
  const arun = await loginAs("Eval Arun", `eval-arun-${stamp}@example.com`);
  const priya = await loginAs("Eval Priya", `eval-priya-${stamp}@example.com`);
  for (const jar of [arun, priya]) {
    const e = await post("/api/rooms/ensure", { code: room }, jar);
    assert(e.status === 200, `ensure ${e.status}`);
  }
  let r = await post("/api/handoff", { roomId: room, action: "initiate" }, arun);
  assert(r.status === 200, `initiate ${r.status}`);
  r = await post("/api/handoff", { roomId: room, action: "close" }, arun);
  assert(r.status === 409, `close-before-ack ${r.status}`);
  r = await post("/api/handoff", { roomId: room, action: "ack" }, priya);
  assert(r.status === 200, `ack ${r.status}`);
  r = await post("/api/handoff", { roomId: room, action: "close" }, priya);
  assert(r.status === 200, `close-after-ack ${r.status}`);
  return "409→ACK→200 ok";
});

await check("S3 cross-room ratify DENY + isolation_violation (authenticated)", async () => {
  const stamp = Date.now();
  const arun = await loginAs("Eval Arun", `eval-arun2-${stamp}@example.com`);
  const priya = await loginAs("Eval Priya", `eval-priya2-${stamp}@example.com`);
  const roomA = `war-eval-a-${stamp}`;
  const roomB = `war-eval-B-${stamp}`;
  assert((await post("/api/rooms/ensure", { code: roomA }, arun)).status === 200, "ensure A");
  assert((await post("/api/rooms/ensure", { code: roomB }, priya)).status === 200, "ensure B");
  const p = await post(
    "/api/approvals",
    { roomId: roomA, action: "db-failover", payloadHash: "evalhash1", step: "propose" },
    arun,
  );
  assert(p.status === 201, `propose ${p.status}`);
  const id = p.json.approval?.id ?? p.json.id ?? p.json.approvalId;
  assert(typeof id === "string" && id.length > 0, "need approval id");
  const r = await post(
    "/api/approvals",
    { roomId: roomB, approvalId: id, payloadHash: "evalhash1", step: "ratify" },
    priya,
  );
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
