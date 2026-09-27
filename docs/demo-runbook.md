# Baton — presentation script (judges cut, ~4 min + Q&A)

Rubric: 35% Product & UX · 30% Technical · 20% Speed & Latency · 15% Demo.
Track 2: Multiplayer AI & Collaborative Agents. Every claim verified:
vitest 154/154, `scripts/eval.mjs` 7/7, tripwire OK, prod smoke green.
Proof: `docs/evidence/`.

## Cast (never swap roles mid-shoot)

- **Browser A — Arun (you).** Proposes, initiates, kills, closes.
- **Browser B — Priya (second person, incognito).** Ratifies, ACKs, resumes.
  DIFFERENT emails — shared identity kills the two-human proof on camera.

## Setup (5 min before)

1080p both windows, bookmarks hidden, extra apps quit. A + B on
`https://baton-war-room.vercel.app/`. Backup: `…/room/war-demo?fixture=1`.
Local fallback: `http://localhost:3112`. Never show: console, `.env`,
dashboards, keys, cookie values.

## 0:00 Problem — sell the pain, in dollars (30s)

"Every SEV1 ends the same way. The outgoing engineer leaves, the newcomer
asks the same three questions, and the agent starts from zero. The median
enterprise outage costs $9,000 a minute, and 91% of enterprises report
outages over $300K. Every repeated question burns at that rate. Baton is
the missing protocol: two humans and one agent sharing one checkpointed
memory — nobody re-asks, nobody closes without an ACK."

## 0:30 Demo — two windows, one room (2:00)

**Login on camera (trust beat).** A: Enter → `Arun`, Primary on-call →
lands OWNER. B: same → `Priya`, Secondary, different email → SAME room
code. Show both rosters: A lists Arun (you) + Priya (online), B mirrored.
"Two humans, one room, no shared password — each tab is its own session."

**Catch-up.** A asks `what happened so far?` → 5 citation chips + ms +
p50/p95 on both windows. Click a chip → inline source. "Priya joined
mid-fire and asked the room, not Arun."

**Redirect.** B types `actually check replica lag first` → A shows B's
typing + avatar live, answer re-queries. "Presence works both ways."

**Kill / resume.** A kills the agent. B ACKs → checkpoint replays,
0 repeats. "Arun's laptop dies with the agent. The successor wakes with
the checkpoint, not an interrogation."

**Co-sign.** A proposes failover → both show `1/2 blocked`. B ratifies
same hash → `2/2` → Execute 200 both sides. "One human is never enough —
two distinct humans, one payload hash, or nothing moves."

**Close.** A closes → **409**. B ACKs. A closes → **200**. Flash metrics
tiles + `?fixture=1` badge once. "No ACK, no close. Hand over the
incident, not the guesswork."

## 2:30 Architecture — one diagram (45s)

Moss session-per-room (shared context + history + semantic retrieval) →
Liveblocks (presence/feeds) → Postgres outbox (durable approvals) →
Gemini (generation only, extractive fallback). "That's the track brief
verbatim: fast shared context, session history, semantic retrieval,
multi-agent state. Retrieval is a function call, not a service query —
index loads once, queries run in-memory at ~10ms p50."

## 3:15 Honest close (30s)

"Limits, stated plainly: one scoped index per room by design; fixture mode
covers retrieval outages at zero spend; co-sign plus an immutable timeline
is what lets Security say yes to agents touching production. Solo-built,
boring managed stack, tripwire-capped costs."

## Q&A — the seven you'll get

1. **Why not pgvector/Pinecone?** Round-trip tax, 100–500ms per lookup —
   seconds of dead time per turn. Same hybrid power (semantic + BM25),
   no infra.
2. **Different from ChatGPT / a shared doc?** Neither enforces handoff:
   ACK gate (409), 2-of-2 co-sign, checkpointed logbook. A doc doesn't
   transfer ownership.
3. **What breaks at scale?** Collab-minute caps + Neon wake (~100ms,
   pinger covers it); one index per room under 500MB; tripwire fails
   the build over caps.
4. **Latency real?** `/api/metrics` live: p50 ~10ms on 20 SOPs. Grows
   with index size — hence scoped indexes.
5. **Business model?** Per-responder seats, viewers free, no AI tax —
   incident.io proved the shape ($45 all-in vs PagerDuty $41 + AI
   add-ons). Land one war-room, expand at the 90-day MTTR review.
6. **Opsgenie is dying — so what?** Shutdown April 2027; every migrating
   team re-evaluates. That's the wedge.
7. **Did AI build this?** Evidence folder: RED→GREEN logs, eval reports,
   commit history. Process proof, not claims.

Close Q&A with: "Happy to go deeper on the per-incident economics or
the Moss session model." Feed the judge your home turf.

## Fallbacks (any stall → no dead air)

Retrieval slow → `?fixture=1`. LLM down → `DISABLE_LLM=1` extractive.
UI stall → curl `POST /api/query {"q":"SEV1 triage"}` → 200 + citations;
`POST /api/handoff` 409→ACK→200.

## After

Upload video + URL → HiDevs submit (repo + live URL + video) → rotate
all keys (Neon, Moss, Liveblocks, Google).
