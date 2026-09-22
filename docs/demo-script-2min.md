# Demo script — Baton war-room in 2:00 (story cut)

Record 1080p, 130wpm. Tabs ready: A landing `/`, B room `/room/war-demo` (Arun),
C incognito same room (Priya). Backup: `/room/war-demo?fixture=1`.
Spoken lines are quoted. Proof: `docs/evidence/`.

Cast: Arun (outgoing, tired), Priya (incoming, fresh), RoomMate (the agent
that remembers). Incident: SEV1 checkout down, 3:04 a.m.

## Setup (before rolling)
Close extra tabs. Hide bookmarks. Open A, B, C. Check Tab B feed loads
with citations. Keep this file open on a second screen — read the quotes,
do the actions.

## 0:00 — The 3 a.m. page (Tab A landing, 15s)
"It's 3:04 a.m. Checkout is down. Arun has been fighting it for two hours
and his shift is over. Every SEV1 ends the same way — the brain walks out
the door with him."
Action: scroll hero once, click Enter room.

## 0:20 — Priya walks in (Tab B + C room, 30s)
"Priya joins mid-fire. She doesn't ask Arun anything. She asks the room:
what happened so far?"
Action: in Tab B SearchBox type `what happened so far?`, Enter. Point at
citation chips + LatencyHud p50/p95.
"Scored sources, milliseconds, zero repeat questions. The logbook is the memory."

## 0:50 — The human steers (Tab B, 20s)
"Then Priya disagrees. Don't chase the deploy — check replica lag first."
Action: type `actually check replica lag first`, Enter. Show Tab C typing
+ avatars moving live.
"Watch the human redirect. The agent re-queries, the feed updates, nobody
refreshes."

## 1:10 — Kill the agent (Tab B kills, Tab C resumes, 25s)
"Now the scary part. Arun's laptop dies — agent with it."
Action: Tab B click Write checkpoint / Kill. Toast shows `ck_...`.
Tab C click ACK in AckModal, feed replays checkpoint + logbook count.
"A successor wakes up with the checkpoint, not an interrogation."

## 1:35 — The dangerous button (Tab B proposes, Tab C ratifies, 25s)
"Failover could save us or bury us. So one human is never enough."
Action: Tab B CoSignTile Propose DB failover → `1/2 blocked`. Tab C Ratify
same hash → `2/2` → Execute 200.
"Two distinct humans, one payload hash, or nothing moves. Fail-closed."

## 1:50 — The door that won't shut (Tab B, 15s)
"Arun tries to close the room and leave. It refuses — 409. No ACK, no close."
Action: Close → 409, then ACK → Close → 200. Flash metrics tiles green,
open `?fixture=1` once for the FIXTURE badge.
"Baton: hand over the incident, not the guesswork."

## Curl backups (if UI hiccups live, run + show output)
```bash
curl -X POST $BASE/api/query -H 'content-type: application/json' -d '{"q":"SEV1 triage"}'
curl -X POST $BASE/api/handoff -H 'content-type: application/json' -d '{"roomId":"war-demo","action":"ack","actor":"priya"}'
curl -X POST "$BASE/api/query?fixture=1" -H 'content-type: application/json' -d '{"q":"SEV1 triage"}'
```
