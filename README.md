# Baton — Shift Handoff War-Room

One live incident room where 2 humans + 1 agent share context. Anyone can watch,
redirect, or hand off; successor agents resume with zero repeat questions; no room
closes without an explicit ACK.

**Live:** https://baton-war-room.vercel.app · **Track:** YC Fall 2026 x Moss — Multiplayer AI

## The loop (5 moves, demo order)

1. **Ask** — anyone asks in the feed; the agent answers with retrieval-backed citations.
2. **Cite** — every answer carries scored sources (`{id, score, text}` + `timeTakenInMs`).
3. **Co-sign** — high-risk actions wait for 2 distinct humans on the same payload hash (fail-closed).
4. **Hand off** — close returns **409** until the successor explicitly ACKs.
5. **Resume** — the successor replays the checkpointed logbook. Zero repeat questions.

## Stack

Next.js 16 (App Router, Fluid Node `iad1`) · Liveblocks (rooms, feeds, presence) ·
Moss `@moss-js/moss` server-only (`war-room-seed`, minilm, 1–10ms in-process) ·
Gemini Flash-Lite (or Vertex AI service account; `DISABLE_LLM=1` extractive fallback) ·
Neon Postgres via Drizzle (SKIP LOCKED outbox, no Redis) · Vercel.

## Run it

```bash
npm install
cp .env.local.example .env   # fill DATABASE_URL×2, MOSS_*, LIVEBLOCKS_*, GOOGLE_*
npx drizzle-kit push
npm run seed                 # builds the war-room-seed Moss index (20 SOPs)
npm run dev                  # :3112
```

Key env: `MOSS_PROJECT_ID/KEY`, `MOSS_INDEX_NAME=war-room-seed`, `LIVEBLOCKS_SECRET_KEY`,
`GOOGLE_GENERATIVE_AI_API_KEY` (or Vertex via `GOOGLE_SERVICE_ACCOUNT_JSON`),
`DISABLE_LLM`, `RECONCILER_INTERVAL_MS`, `CO_SIGN_WINDOW_MS`. Server-only — never `NEXT_PUBLIC_*`.

## Verify (the contract)

```bash
npx vitest run                       # 35 tests
node scripts/eval.mjs                # S1/S2/S3 gate → docs/evidence/eval-report.json
node scripts/tripwire.mjs            # usage-cap build gate
curl -X POST localhost:3112/api/query -H 'content-type: application/json' -d '{"q":"SEV1 triage"}'
```

Query params that matter: `?fixture=1` (canned docs, zero retrieval spend),
`?offline` (OFFLINE badge + outbox replay).

## Docs

- `plan.md` — the build plan (waves, SLOs, cost guard)
- `docs/architecture.md` — system design
- `docs/demo-script-2min.md` — the 2-minute shoot script
- `docs/evidence/` — curl bodies, screenshots, eval reports (proof, not claims)
