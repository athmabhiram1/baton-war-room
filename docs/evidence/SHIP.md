# T9 Ship Gate — SHIP.md (2026-09-26, terminal wave; T1–T8 GREEN)

Verdict: **CONDITIONAL GO — 4 of 5 gates PASS; eval gate honest FAIL 4/6 (S3 auth-harness mismatch, reported not patched).**
No commits. No production code changes (evidence files + this doc only). No secrets. No voice code.

## Gate results

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| a | `npx vitest run` full suite | **PASS — 17 files / 105 tests, all green** | `docs/evidence/vitest-run.txt` |
| b | `node scripts/eval.mjs` S1/S2/S3 → `eval-report.json` | **FAIL — 4/6 PASS** (S1 1/1, S2 2/2, S3 metrics 1/1; S3 handoff + cross-room ratify 401) | `docs/evidence/eval-report.json` |
| c1 | `node scripts/latency-probe.mjs` (20 queries, SLO p50≤800ms / p95≤2000ms) | **PASS — 20/20 OK, p50=21ms p95=125ms** | `docs/evidence/latency-log.json` |
| c2 | `node scripts/tripwire.mjs` usage-cap build gate | **PASS — `tripwire OK: docCount=20 p50=1 p95=1`** | stdout (metrics cross-check) |
| d | Prod smoke `https://baton-war-room.vercel.app/api/health` + `/api/metrics` | **PASS — health 200 `{"ok":true}`; metrics 200 `docCount=20`** | `docs/evidence/prod-smoke-health.json`, `docs/evidence/prod-smoke-metrics.json` |

## Failing gate detail (gate b — reported, NOT patched)

- `S3 handoff 409 → ACK → 200` → **FAIL: `initiate 401`**
- `S3 cross-room ratify DENY + isolation_violation` → **FAIL: `propose 401`**
- Root cause: T-wave auth contract (session-cookie required) vs eval harness sends no cookie.
  `app/api/handoff/route.ts:64` and `app/api/approvals/route.ts:67-78` return
  `401 {"error":"unauthorized"}` when no `cookie` header is present — verified live
  (`POST /api/handoff` → 401, `POST /api/approvals` → 401). The 105 vitest tests pass
  because they mock auth; the eval script exercises the real session gate with no session.
- This is an **eval-harness/auth-contract mismatch, not a production defect**: fail-closed 401
  with no credential is the intended behavior (per T-wave notes in build log). Fixing it means
  either teaching `scripts/eval.mjs` to log in first (harness change) or relaxing the route —
  both out of scope for the ship wave per "real bugs get reported, not patched". No change made.

## Wave evidence index (all waves)

| Wave | Artifact(s) |
|------|-------------|
| S1 query contract | `docs/evidence/query-curl-body.json`, `docs/evidence/metrics-curl-body.json`, `docs/evidence/latency-log.json` (fresh p50=21/p95=125, 20/20 OK, 5 citations each) |
| S2 catchup/fixture | `docs/evidence/eval-report.json` (S2 rows PASS), `docs/evidence/handoff-curl-matrix.json` (`ack.resume`) |
| S3 handoff/co-sign/reconciler | `docs/evidence/handoff-red.txt`, `docs/evidence/handoff-green.txt`, `docs/evidence/handoff-curl-matrix.json` (`cross`, `exec12`, `exec22`), `docs/evidence/cosign-2ctx.spec.ts`, `docs/evidence/reconciler-curl-body.json` |
| T1–T8 auth + front wiring | `docs/evidence/e2e-auth.png`, `tests/e2e-auth.spec.ts` (4/4 per build log), `docs/evidence/cosign-2ctx.png`, `docs/evidence/ops-wired.png` + `ops-wired.spec.ts`, `docs/evidence/wiring-feed.png` + `wiring-feed.spec.ts`, `docs/evidence/wiring-ops.spec.ts`, `docs/evidence/wiring-presence.png`, `docs/evidence/feed-wired.png`, `docs/evidence/worker-turn.png` + `worker-turn.spec.ts`, `docs/evidence/room-ui.png` |
| T9 ship gate (this wave) | `docs/evidence/vitest-run.txt` (17/105), `docs/evidence/eval-report.json` (4/6), `docs/evidence/latency-log.json` (fresh), `docs/evidence/prod-smoke-health.json`, `docs/evidence/prod-smoke-metrics.json`, this file |

## Test counts

- Vitest: **17 files, 105 tests, 105 passed** (Duration ~9s; full log in `vitest-run.txt`).
- Eval: **4/6 PASS** (`S1 query` PASS citations=5 ms=1; `S2 fixture` PASS canned=3;
  `S2 catchup` PASS citations=5; `S3 metrics` PASS p50=1 p95=1; 2× S3 FAIL 401 — see above).
- Latency probe: **20/20 OK**, p50=21ms / p95=125ms vs SLO 800/2000. Metrics cross-check at probe time: p50=1 p95=2 docCount=20 sampleSize=43.
- Prod smoke: health 200 ok:true; metrics 200 p50=0 p95=0 docCount=20 sampleSize=0 (cold prod, no queries sampled yet).

## Deferred live verifications

- **NEON_AUTH_BASE_URL absent**: no live Neon Auth sessions possible locally or in eval; all
  session paths (spoof→403, 1/2→403, 2/2→200, ACK resume) covered by mocked-auth vitest + T8
  network-edge-mocked e2e only. Live co-sign/handoff with real sessions deferred to prod-with-auth.
- **S3 eval gates (handoff 409→ACK→200, cross-room DENY) never exercised live end-to-end**:
  blocked by the same missing session; only unit/e2e-mocked coverage exists.
- **Prod metrics cold** (sampleSize=0): prod p50/p95 unproven under real traffic; external 5-min
  pinger + daily `/api/health` cron expected to warm per deploy plan.

## Residual risks

1. Eval script drift: `scripts/eval.mjs` predates the session-cookie contract, so the 6/6 gate is
   structurally unpassable until the harness logs in first. Ship condition: fix harness, re-run.
2. `scripts/latency-probe.mjs` defaults to `LATENCY_BASE=http://localhost:3000` (dev runs :3112)
   and writes `latency-log.json` to repo root — first probe run measured failed-fetch latency
   (status 0). Re-ran with `LATENCY_BASE=http://localhost:3112`; fresh log promoted to
   `docs/evidence/latency-log.json`, stray root file removed. Recommend a follow-up hardening the
   script default/output path (not done in this wave).
3. No live-Neon-timeout flake observed this run (all suites green, no retries needed).

## Changes made in this wave (evidence only)

- M `docs/evidence/eval-report.json` (fresh 4/6 run), M `docs/evidence/latency-log.json` (fresh
  20/20 probe), A `docs/evidence/vitest-run.txt`, A `docs/evidence/prod-smoke-health.json`,
  A `docs/evidence/prod-smoke-metrics.json`, A `docs/evidence/SHIP.md` (this file).
- `git status --porcelain` confirms zero production-code modifications. No commits.

## Momus-ready summary

T9 ship gate: vitest 17/105 PASS; latency p50=21ms/p95=125ms PASS (SLO 800/2000); tripwire
docCount=20 PASS; prod smoke health+metrics 200 PASS. Eval 4/6 FAIL — both failures are S3
401s from the eval harness sending no session cookie to routes that correctly fail closed;
reported, not patched. Deferred: live Neon Auth sessions (NEON_AUTH_BASE_URL absent), live S3
end-to-end, prod traffic warm-up. Recommendation: CONDITIONAL GO pending eval-harness login fix.
