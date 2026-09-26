# Demo runbook — two people, two browsers (technical cut, 2:00 + setup)

Every claim below is verified: vitest 131/131, `scripts/eval.mjs` 7/7,
tripwire OK, prod smoke green. Proof: `docs/evidence/`.
Story cut: `docs/demo-script-2min.md`.

## Cast & windows (label them, never swap roles mid-shoot)

- **Browser A — Arun (you, normal window).** Proposes, initiates, kills, closes.
- **Browser B — Priya (second person, separate window or incognito).**
  Ratifies, ACKs, resumes. Uses a DIFFERENT email (Google SSO shares
  identity per profile, so email login for both — or one Google + one email).

## Setup (5 min before rolling)

- Both windows 1080p, hide bookmarks, quit extra apps.
- Window A: `https://baton-war-room.vercel.app/` (landing).
- Window B: same landing URL, separate window/profile.
- Backup: `…/room/war-demo?fixture=1` (canned docs, zero spend, can't fail).
- Local fallback if prod hiccups: `http://localhost:3112` (dev server running).

## Login, on camera (30s — this IS the demo's trust beat)

1. Window A: click Enter the war-room → login modal → name `Arun`,
   role Primary on-call, email `arun@demo…`, password → Continue →
   lands in `/room/war-demo` as OWNER.
2. Window B: same steps → name `Priya`, role Secondary, DIFFERENT email
   → lands in the SAME room code.
3. Show both rosters side by side: A lists Arun (you) + Priya (online),
   B lists Priya (you) + Arun (online). Typing in one shows in the other.
   Say: "Two humans, one room, no shared password — each tab is its own
   session cookie."

## Beat sheet (who does what, per beat)

### 0:20 Catch-up — A asks, both watch (30s)
A: SearchBox → `what happened so far?` → Enter.
Show on A: 5 citation chips (`SOP-xxx` + score), `timeTakenInMs`,
LatencyHud p50/p95. Click one chip → inline source (id/score/text).
B watches the same answer arrive live (shared feed, not screen-share).
Say: "Priya joined mid-fire and asked the room, not Arun."
Tech: `POST /api/query` → Moss `war-room-seed` session, topK 5, in-process ms.

### 0:50 Redirect — B steers, A watches (20s)
B: type `actually check replica lag first` → Enter; A shows B's typing +
avatar live, then the re-queried answer.
Say: "Watch the human steer — presence is live both ways."
Tech: Liveblocks presence (`useOthers`/`useSelf`), feed re-query.

### 1:10 Kill / resume — A kills, B resumes (25s)
A: Simulate agent kill. B: ACK in AckModal → feed replays checkpoint +
logbook count, 0 repeats.
Say: "Arun's laptop dies with the agent. The successor wakes with the
checkpoint, not an interrogation."
Tech: `POST /api/handoff` initiate → PENDING, ack → resume payload.

### 1:35 Co-sign — A proposes, B ratifies (25s) ⚠️ shoot AFTER the shared-approval fix lands
A (Approval tab): Propose failover → BOTH windows show the SAME approval
(A SIGNED / B WAITING), `1/2 blocked`.
B: Ratify the same hash → BOTH flip to `2/2` → Execute 200.
Say: "One human is never enough — two distinct humans, one payload hash,
or nothing moves."
Tech: SHA-256 payloadHash, 10-min window, fail-closed (same-human /
wrong-hash / expired = 403 + `actor_spoof` audit).

### 1:50 Metrics + close — A closes, B releases (15s)
A: Close → **409**. B: ACK. A: Close → **200**. Point at metrics tiles.
Flash `?fixture=1` FIXTURE badge once.
Say: "No ACK, no close. Baton: hand over the incident, not the guesswork."
Tech: `GET /api/metrics` p50/p95, `docs/evidence/eval-report.json` 7/7.

## Per-beat fallbacks

- Retrieval slow → `?fixture=1` (canned, zero calls).
- LLM down → `DISABLE_LLM=1` extractive answers (verified path).
- Any UI stall → curl backup: `POST /api/query {"q":"SEV1 triage"}` → 200
  + citations; `POST /api/handoff` 409→ACK→200 (see `scripts/eval.mjs`).

## Don't show

Devtools console, `.env`, Vercel/Neon dashboards, any key or cookie value.
Never log both windows into the same email — shared identity kills the
two-human proof on camera.

## After the shoot

1. Upload video, attach URL.
2. HiDevs submit: repo + `https://baton-war-room.vercel.app` + video.
3. Rotate all keys (Neon, Moss, Liveblocks, Google) — `.env` values have
   appeared in agent logs during the build; treat as exposed.
