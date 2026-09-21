# Baton (Shift Handoff War-Room) — Final Build Plan
Consolidated from PRD v2 → v5. Authoritative spec: patched `(4).md` + `(5).md` (identical after port-backs).
Track: Multiplayer AI and Collaborative Agents. Solo, all keys ready, 36h to Sep 23 12:00 IST. Stack: Next.js 16 + Liveblocks + Moss server SDK + Gemini Flash + Postgres-only + Vercel.

## 1. Goal (binding)
One live war-room per incident where 2 humans + 1 agent share context; anyone can watch/redirect/hand-off; successor agents resume with zero repeat questions; no room closes without an explicit ACK. Stop when: prod URL passes S1/S2/S3 below + video recorded + HiDevs submit updated.

## 2. Scenario contract (all must PASS with test + surface proof)
- **S1 happy:** `POST /api/query {q}` → 200 + ≥2 citations `{id,score,text}` + `timeTakenInMs`. Proof: `tests/query.test.ts` RED→GREEN + `curl` body saved.
- **S2 edge:** kill agent → successor `session(same war-roomId)` resumes via logbook + `push_index` checkpoint, zero repeat questions; `?fixture=1` answers with canned docs (no Moss call); `?offline` shows OFFLINE badge + replays. Proof: `tests/fixture.test.ts` + `tests/offline.test.ts` + `tests/e2e.spec.ts` + Playwright trace + screenshots.
- **SLO binding:** 20-query probe p50 ≤800ms, p95 ≤2000ms or S3 FAILS. Owner: T2 writes `scripts/latency-probe.mjs`; T5 writes `scripts/eval.mjs` + snapshot generators; T7 only runs them.
- **S3 regression:** close with PENDING_HANDOFF + no ACK → 409; after ACK → 200; cross-room query → DENY + `isolation_violation` audit; `/api/metrics` p50/p95 green. Proof: `scripts/eval.mjs` + curl outputs.

## 3. Seed corpus (20 SOPs, `data/sops/*.md`, 150-300 words each, metadata kind+priority)
Sev1 triage, Sev2 triage, rollback runbook, comms template, handoff template, deploy freeze, DB failover, cache stampede, DNS incident, TLS expiry, queue backlog, disk-full node, OOM pod, 5xx spike, latency SLO burn, auth outage, rate-limit tuning, flag kill, postmortem template, escalation matrix.

## 4. Waves (strictly sequential — solo dev, NO parallel waves; commit+push after every T, tag w1-green/w2-green, never start next wave on red)
- **W1 0-5h T1 scaffold+provision** (`quick`; programming+git-master): Next.js TS + Room.tsx + `/api/health` + `/api/liveblocks-auth` + vercel.json + Vercel project (Root ycomb, region iad1) + Neon Postgres via Vercel Marketplace (AWS us-east-1; pooled URL for app, unpooled for migrations) + Drizzle decided now (lib/db.ts + drizzle.config.ts + drizzle/0001_outbox_approvals_audit.sql + RLS) + env (DATABASE_URL×2, MOSS_*, LIVEBLOCKS_SECRET_KEY, GOOGLE key, DISABLE_LLM, RECONCILER_INTERVAL_MS, CO_SIGN_WINDOW_MS) + deploy runbook 30min (below §9). Verify: curl health local + prod + `drizzle-kit push` + SELECT outbox works + `git log` shows push.
- **W2 4-12h T2 memory** (`deep`; programming+performance-profiling): seed script → 1 Moss index (minilm) → `session("war-<id>")` → `/api/query|catchup|metrics|moss-token`. Verify: curl query + p50/p95.
- **W3 12-26h, in order — T3 UI 12-18h** (`visual-engineering`; frontend+react+shadcn): war-feed + agent-status + presence + ack modal + HUD. **T4 worker 18-22h** (`deep`; programming): feed→validation query→generateText→write+addDocs. **T5 gates 22-26h** (`deep`; programming+playwright): handoff 409/200, co-sign payloadHash/W=10min (test override CO_SIGN_WINDOW_MS=60000), funnel, durable HITL + reconciler (test override RECONCILER_INTERVAL_MS=5000), retry max3→ESCALATED. Verify: Playwright 2-browser full matrix + tests/handoff.test.ts (<2min via short overrides, required).
- **W4 26-36h — T6 resilience 26-30h MAX 2h** (`unspecified-high`): fixture/offline/polish (PWA manifest + field-manuals.json cut first if behind). Sleep 4h 26-30h OR descope fixture/offline to canned-only. **T7 ship MUST start NLT Sep 22 24:00 IST regardless of T6 state** (`quick`+`writing`; git-master+playwright+deep-research): README, demo script, tag `v0.1-war-room`, prod smoke, HiDevs submit. Verify: prod curl S1/S2/S3 + video file. 4h buffer lives in W4 — video shoot+edit+upload alone is 2-3h.

## 5. Non-negotiable technical rules
- Context7-first: before writing code against ANY library (Next.js, Liveblocks, Moss, Drizzle, Neon, Vercel AI SDK), query Context7 for its current docs and follow the returned pattern; paste the doc link into the commit message. No library code from memory alone.
- TDD law: write the FAILING test first, run it, capture RED (right reason, not syntax); then the smallest GREEN change; then the real-surface artifact (curl/Playwright/Vercel URL). Production code before its failing test = revert and redo. No test deletion, ever.
- Momus gate: after every wave, the wave's diff + evidence goes to Momus for accept/reject; rejected waves get at most 2 re-reviews, then escalate to user. Never start the next wave on red.
- Query path sync in-process 1-10ms; update path background (300s default, 30s fast-inventory only); never cross them.
- Funnel ONLY for pushIndex+audit per roomId; never around CRDT/presence.
- Co-sign: distinct humans, same payloadHash, W=10min, fail-closed.
- `war-roomId` server-derived on every query; RLS; DENY+log cross-room.
- Liveblocks code caps: LiveObject ≤128KB total keys+values (cap logbook LiveList growth — paginate/archive to Postgres beyond ~500 entries); solo sessions $0; rooms idle-pause after 10s.
- Gemini free: Flash 10 RPM/250K TPM/~250-1500 RPD, Lite 15 RPM/1000 RPD — G1 pacing (1 req/6s) already compliant.
- PENDING_HUMAN_APPROVAL = Postgres row + reconciler 5min + webhook resume + 5s poll fallback.
- No Redis (Postgres SKIP LOCKED outbox); no Threads in 36h; no secrets in NEXT_PUBLIC_*.
- Cost Guard: L1 Liveblocks caps + solo-rehearse; M1 Moss ≤3idx/500MB, freeze refresh in judging; G1 Flash-Lite caps; G2 truncation fn; Fluid Node 1-region + tripwire.

## 6. Submission checklist
- [ ] Architecture submitted (done) + mentoring loop closed
- [ ] GitHub repo public, README + arch diagram + PRD (5).md
- [ ] Vercel URL live, `/api/health` + `/api/metrics` public
- [ ] 2-min video (beats §13 + P6 demo lane: 0:00 friction → 0:20 catch-up → 0:50 redirect → 1:10 kill/resume → 1:35 co-sign → 1:50 metrics+fixture)
- [ ] HiDevs submit updated with repo + link + video

## 8. Repo structure (T1 must match exactly — verify with `tree /F` before W2)
```
ycomb/
├── app/
│   ├── layout.tsx                  # LiveblocksProvider + metadata
│   ├── page.tsx                    # landing → create/join room
│   ├── manifest.ts                 # PWA manifest (cut first if behind)
│   ├── room/[id]/page.tsx          # war-room screen (server: auth check)
│   ├── room/[id]/Room.tsx          # RoomProvider id=war-<id> + ClientSideSuspense
│   ├── middleware.ts               # room/[id] session check → redirect / (DENY lives here)
│   └── api/
│       ├── health/route.ts         # GET → {ok:true} (warm ping target)
│       ├── liveblocks-auth/route.ts# POST prepareSession → allow("war-<uuid>") → authorize
│       ├── moss-token/route.ts     # GET getAuthToken (IAuthenticator bridge)
│       ├── query/route.ts          # POST Moss session.query → citations + timeTakenInMs
│       ├── catchup/route.ts        # POST high-priority recall summary
│       ├── handoff/route.ts        # POST initiate/ACK, PENDING_HANDOFF, 409/200
│       └── metrics/route.ts        # GET p50/p95 + docCount
├── components/
│   ├── SearchBox.tsx  AnswerCard.tsx  OfflineBadge.tsx
│   ├── LatencyHud.tsx              # ms + p50/p95 + LIVE/FIXTURE/OFFLINE badges
│   ├── PresenceAvatars.tsx         # avatar stack + typing
│   └── AckModal.tsx                # explicit ownership ACK button
├── lib/
│   ├── db.ts                       # drizzle client + outbox/approvals/audit queries + RLS helper warRoomId()
│   ├── cosign.ts                   # payloadHash + W-window fail-closed check
│   ├── moss-server.ts              # module-scope client + loadIndex-once + session(roomId)
│   ├── moss-browser.ts             # lazy client-only singleton (iff browser search needed)
│   ├── answer.ts                   # truncation fn (G2) + citation shaping
│   ├── perf.ts                     # 4 timers: presence.join/feed.publish/moss.query/handoff.ack
│   └── idb.ts                      # fixture docs + outbox fallback (iff needed)
├── data/sops/*.md                  # 20 seed SOPs (§3)
├── scripts/
│   ├── seed-moss.ts                # createIndex war-room-seed (minilm) via Node SDK
│   ├── latency-probe.mjs           # 20 queries → latency-log.json (T2 owns)
│   ├── cleanup.mjs                 # deleteRoom + deleteDocs + assert indexCount<=3 (run after every test)
│   ├── tripwire.mjs                # W4 only: fail build if Moss idx/size or Liveblocks caps exceeded
│   └── eval.mjs                    # S1/S2/S3 gate → eval-report.json (T5 owns, T7 runs)
├── tests/
│   ├── setup.ts                    # afterEach deleteRoom/deleteDocs (wired in vitest + playwright teardown)
│   ├── health.test.ts  query.test.ts  metrics.test.ts
│   ├── handoff.test.ts             # 409→ACK→200 in <2min via short overrides (T5, required)
│   ├── fixture.test.ts             # ?fixture=1 canned docs, zero Moss calls
│   ├── offline.test.ts             # ?offline badge + idb/outbox replay
│   └── e2e.spec.ts                 # Playwright 2-browser matrix (S2/S3)
├── docs/
│   ├── architecture.md  architecture.png  PRD-1page.md  demo-script-2min.md
├── drizzle/                       # DECIDED: Drizzle (not Prisma) — 0001_outbox_approvals_audit.sql + RLS per roomId
│   ├── drizzle.config.ts (repo root, Drizzle convention)  lib/db.ts (see lib)
├── public/manifest.webmanifest  public/indexes/field-manuals.json  public/moss-snapshot.json
├── package.json  next.config.mjs  vercel.json  vitest.config.ts  playwright.config.ts
├── .env.local.example              # DATABASE_URL(+_UNPOOLED), MOSS_PROJECT_ID, MOSS_PROJECT_KEY, MOSS_INDEX_NAME=war-room-seed, LIVEBLOCKS_SECRET_KEY, GOOGLE key, DISABLE_LLM=0, RECONCILER_INTERVAL_MS, CO_SIGN_WINDOW_MS (test overrides documented)
├── .vercelignore  README.md  CHANGELOG.md  plan.md
```
Rules: server-only `MOSS_PROJECT_KEY`/`LIVEBLOCKS_SECRET_KEY` (never `NEXT_PUBLIC_*`); no Redis dep; add Postgres driver first, Liveblocks second, nothing else until W2 green; `deleteRoom` + `deleteDocs` hygiene after each test (collab-min + index caps).
- v2 baseline (gates, 409, funnel, retry-max3) → kept.
- v3 additions (300s/30s, validation query, scoped funnel, durable row, Postgres) → kept.
- v4/v6 patches (reconciler, SKIP LOCKED, full Cost Guard, Fluid deploy, Threads deferred, DISABLE_LLM) → kept.
- v5 regen losses (exact caps, reconciler, funnel scope) → ported back; (5).md now authoritative-equal.
- Oracle cuts honored: Redis, Threads; Oracle keeps honored: LLM guards, 1-index discipline, Liveblocks minimal.
- Report overreaches rejected: delete-funnel, 30s-always-wrong, LiveKit/Python roadmap.

## 9. Deployment (proper, cost-efficient — verified Sep 2026)
Shape: Vercel Hobby + Fluid Node.js (not Edge — Edge 25s response cap breaks Gemini tails + PG txns), single region `iad1`, Neon Postgres via Vercel Marketplace (Vercel Postgres is dead), Neon region AWS us-east-1 (same-region single-digit ms; cross-region +50-150ms). App uses pooled `-pooler` URL via `@neondatabase/serverless`; migrations use unpooled URL. Hobby hard caps (pause, no overage): 100 GB bandwidth, 1M invocations, 4 CPU-hrs, 360 GB-hrs, 100 builds/day-ish, 10 GB deploy storage, Hobby cron 1×/day only → sub-daily warm needs EXTERNAL 5-min pinger (GitHub Actions/UptimeRobot → GET /api/health + Bearer CRON_SECRET; ~8.6k invocations/mo, inside 1M). Non-commercial only — hackathon OK.
Checklist: 1) push repo, import (Root ycomb, auto Next) 2) region iad1 (`vercel.json` regions) 3) Marketplace Neon → us-east-1 → verify DATABASE_URL×2 injected 4) migrate via UNPOOLED from local/CI 5) set Production+Preview env (DATABASE_URL×2, BETTER_AUTH_SECRET/URL, LIVEBLOCKS_*, GEMINI_*, CRON_SECRET --sensitive; MOSS_PROJECT_ID + MOSS_PROJECT_KEY confirmed per docs; keys rotatable with ~20s revoke) 6) lean functions (SSG/ISR shell, payloads <4.5MB, maxDuration ≤300s, 512MB-1GB) 7) daily vercel.json cron + external 5-min pinger 8) warm+health verify cold→warm, Neon wake 100s ms, watch Usage Dashboard 9) prune previews (<10 GB), 1-hr log window, 30-day reset reminder. Liveblocks model is credits-based (Free hard caps per meter, 3000 min/200 comments/3M updates); MAU is a fair-use guardrail, not a billed meter.

## 10. Risks + descope order (binding)
If behind at 26h, cut in order: PWA manifest → field-manuals.json → LatencyHud polish → catchup summary → offline replay (keep badge only). Never cut: 409/200 gates, ACK, isolation DENY, metrics. Pin moss/liveblocks/gemini versions in W1.
