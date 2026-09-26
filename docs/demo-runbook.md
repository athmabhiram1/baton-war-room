# Demo runbook — Baton war-room, technical cut (2:00 + setup)

Every claim below is verified: vitest 131/131, `scripts/eval.mjs` 7/7,
tripwire OK, prod smoke green. Proof: `docs/evidence/`.
Story cut: `docs/demo-script-2min.md`.

## Setup (5 min before rolling)

- Chrome 1080p, hide bookmarks, quit extra apps (fans = mic noise).
- Tab A: `https://baton-war-room.vercel.app/` (landing).
- Tab B: `…/room/war-demo` — log in as Arun (email login).
- Tab C (incognito): same room — log in as Priya (different email).
- Backup: `…/room/war-demo?fixture=1` (canned docs, zero spend, can't fail).
- Local fallback if prod hiccups: `http://localhost:3112` (dev server running).

## What the judges score (map every beat to it)

Track 2 Multiplayer AI: two humans + one agent sharing one room (beats 2–3).
Moss zero-latency: cited answers + p50/p95 on screen (beats 2, 6).
Gates: 409 close, 2-of-2 co-sign, DENY, reconciler (beats 4–5).

## Beat sheet

### 0:00 Friction — Tab A landing (15s)
Say: "Every SEV1 ends the same way. The responder leaves, the newcomer
asks the same three questions, the agent starts from zero."
Do: scroll hero once, click Enter the war-room → login modal.
Tech shown: hero-first flow, themed modal, live greeting preview.

### 0:20 Catch-up — Tab B room (30s)
Say: "Priya joins mid-fire and asks the room, not Arun."
Do: SearchBox → `what happened so far?` → Enter.
Show: 5 citation chips (`SOP-xxx` + score), `timeTakenInMs`, LatencyHud
p50/p95. Click one chip → inline source (id/score/text).
Tech: `POST /api/query` → Moss `war-room-seed` session, topK 5, in-process ms.

### 0:50 Redirect — Tab B + C (20s)
Say: "Priya disagrees — check replica lag first. Watch the human steer."
Do: type `actually check replica lag first` → Enter; show Tab C typing +
avatars moving live.
Tech: Liveblocks presence (`useOthers`/`useSelf`), feed re-query.

### 1:10 Kill / resume — Tab B kills, Tab C resumes (25s)
Say: "Arun's laptop dies with the agent. The successor wakes with the
checkpoint, not an interrogation."
Do: Tab B Simulate agent kill → Tab C ACK in AckModal → feed replays
checkpoint + logbook count, 0 repeats.
Tech: `POST /api/handoff` initiate → PENDING, ack → resume payload.

### 1:35 Co-sign — Tab B proposes, Tab C ratifies (25s)
Say: "Failover could save us or bury us. One human is never enough."
Do: CoSignTile Propose (hash = SHA-256 of payload, shown) → `1/2 blocked`;
Tab C Ratify same hash → `2/2` → Execute 200.
Tech: distinct humans, same payloadHash, 10-min window, fail-closed
(same-human/wrong-hash/expired = 403 + `actor_spoof` audit).

### 1:50 Metrics + close — Tab B (15s)
Say: "Arun tries to leave. The room refuses — 409. No ACK, no close."
Do: Close → 409; ACK → Close → 200. Point at metrics tiles + tripwire.
Flash `?fixture=1` FIXTURE badge once.
Say: "Baton: hand over the incident, not the guesswork."
Tech: `GET /api/metrics` p50/p95, `docs/evidence/eval-report.json` 7/7.

## Per-beat fallbacks (if anything hiccups live, cut to these)

- Retrieval slow → `?fixture=1` (canned, zero calls).
- LLM down → `DISABLE_LLM=1` extractive answers (verified path).
- Any UI stall → curl backup: `POST /api/query {"q":"SEV1 triage"}` → 200
  + citations; `POST /api/handoff` 409→ACK→200 (see `scripts/eval.mjs`).

## Don't show

Devtools console, `.env`, Vercel/Neon dashboards, any key or cookie value.

## After the shoot

1. Upload video, attach URL.
2. HiDevs submit: repo + `https://baton-war-room.vercel.app` + video.
3. Rotate all keys (Neon, Moss, Liveblocks, Google) — `.env` values have
   appeared in agent logs during the build; treat as exposed.
