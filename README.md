# Baton — Shift Handoff War-Room

One live incident room where 2 humans + 1 agent share context. Anyone can
watch, redirect, or hand off. Successor agents resume with zero repeat
questions. No room closes without an explicit ACK.

Track: Multiplayer AI and Collaborative Agents. Submit: Sep 23.

## What it is

A Next.js 16 war-room UI (built from `docs/reference/front.html`) backed by
a Moss `war-room-seed` index of 20 SOPs, Liveblocks rooms and presence,
Gemini Flash-Lite generation, and Neon Postgres for durable approvals,
outbox, and audit. Proof for each claim lives in `docs/evidence/`.

## Demo (2 minutes)

Open the room, ask a question, watch cited answers arrive. Kill the agent,
let the successor replay the checkpoint. Propose a risky action, collect
2-of-2 co-signs, then close via handoff ACK. Full beat sheet with exact
clicks and curls: `docs/demo-script-2min.md`.

Zero-spend rehearsal: append `?fixture=1` to any query for canned docs
with no Moss call (`scripts/eval.mjs` S2 gate,
`docs/evidence/eval-report.json`).

## Run

```bash
npm install
cp .env.local.example .env.local  # fill the table below, names only
npx drizzle-kit push              # migrations use the unpooled URL
npm run seed                      # builds war-room-seed from data/sops (20 files)
npm run dev                       # http://localhost:3112
```

Verify the contract:

```bash
npx vitest run
node scripts/eval.mjs             # 6/6 gates to docs/evidence/eval-report.json
node scripts/tripwire.mjs         # usage-cap build gate (p50, p95, docCount)
curl -X POST localhost:3112/api/query \
  -H 'content-type: application/json' -d '{"q":"SEV1 triage"}'
```

Saved proof: `docs/evidence/query-curl-body.json`,
`docs/evidence/metrics-curl-body.json`,
`docs/evidence/latency-log.json`.

## Deploy

Vercel Hobby, Fluid Node.js, single region `iad1` (`vercel.json`). Neon
Postgres via Vercel Marketplace in AWS us-east-1. App uses the pooled URL,
migrations use the unpooled URL. Daily `/api/health` cron plus an external
5-minute pinger keeps the room warm. Detail: `plan.md` §9.

## Env

| Name | Purpose | Default |
| ---- | ------- | ------- |
| `MOSS_PROJECT_ID` | Moss project for the seed index | required |
| `MOSS_PROJECT_KEY` | Moss server key, server-only | required |
| `MOSS_INDEX_NAME` | Index name, always `war-room-seed` | `war-room-seed` |
| `DATABASE_URL` | Pooled Neon URL for the app | required |
| `DATABASE_URL_UNPOOLED` | Unpooled Neon URL for migrations | required |
| `LIVEBLOCKS_SECRET_KEY` | Liveblocks auth, server-only | required |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini Flash-Lite generation | required |
| `DISABLE_LLM` | `1` forces the extractive fallback, zero spend | `0` |
| `RECONCILER_INTERVAL_MS` | Approval sweep cadence (tests: `5000`) | `300000` |
| `CO_SIGN_WINDOW_MS` | Co-sign window (tests: `60000`) | `600000` |

Server-only keys never use `NEXT_PUBLIC_*`. Template:
`.env.local.example`.

## Architecture

```text
browser room UI -> Next.js routes -> Moss session -> Postgres
   Liveblocks presence/feeds      war-room-seed     approvals/outbox/audit
   (rooms, typing, feed)          20 SOPs, topK 5   SKIP LOCKED drain
```

Routes: `health`, `liveblocks-auth`, `moss-token`, `query`, `catchup`,
`handoff`, `metrics`, plus `turn` (one worker turn), `approvals` (2-of-2
co-sign), and `reconciler` (stale-approval sweep). Query path is sync
in-process; the update path runs in the background. Funnel covers only
pushIndex and audit writes per room.

Room UI: `docs/evidence/room-ui.png`. Worker turn:
`docs/evidence/worker-turn.png`, `docs/evidence/worker-turn.spec.ts`.

## Scenarios

| ID | Contract | Evidence |
| -- | -------- | -------- |
| S1 | `POST /api/query` returns 200, 2+ `{id,score,text}` citations, `timeTakenInMs` | `docs/evidence/query-curl-body.json` |
| S1 | 20-query probe p50 ~10ms, SLO p50 ≤800ms, p95 ≤2000ms | `docs/evidence/latency-log.json` |
| S2 | Kill agent, successor replays checkpoint, zero repeat questions | `docs/evidence/handoff-curl-matrix.json` (`ack.resume`) |
| S2 | `?fixture=1` canned docs, zero Moss calls; `?offline` badge plus replay | `docs/evidence/eval-report.json` (S2 rows) |
| S3 | Close with `PENDING_HANDOFF` and no ACK returns 409; after ACK returns 200 | `docs/evidence/handoff-red.txt`, `docs/evidence/handoff-green.txt` |
| S3 | Cross-room ratify returns DENY plus `isolation_violation` audit | `docs/evidence/handoff-curl-matrix.json` (`cross`) |
| S3 | 2-of-2 co-sign on one payload hash, 1-of-2 stays blocked, fail-closed | `docs/evidence/cosign-2ctx.spec.ts`, `docs/evidence/handoff-curl-matrix.json` (`exec12`, `exec22`) |
| S3 | Reconciler expires or escalates stale approvals on cadence | `docs/evidence/reconciler-curl-body.json` |

Gate rollup: `node scripts/eval.mjs` passes 6/6 to
`docs/evidence/eval-report.json`.

## Cost guard

One Moss index (`war-room-seed`, 20 docs), freeze refresh during judging.
Gemini Flash-Lite with 1 req/6s pacing, 256 output tokens, prompt
truncation, and `DISABLE_LLM=1` extractive fallback. Liveblocks solo
rehearsal with idle-pause. `scripts/tripwire.mjs` fails the build when
`docCount`, p50, or p95 breach caps. Full rules: `plan.md` §5.
