# Demo script — 2 minutes (T7 shoot)

Record at 1080p, room URL with `?fixture=1` as backup if Moss is slow. Speak ~130wpm.

## 0:00 Friction (15s)
"Every SEV1 ends the same way: the outgoing engineer leaves, the incoming asks the
same three questions, and the agent starts from zero. Baton is a war-room where two
humans and one agent share one checkpointed memory." Show hero → click Enter.

## 0:20 Catch-up (30s)
New browser, same room: "Priya just joined mid-incident." Ask "what happened so far?"
Agent answers with scored citations — "no repeat questions, everything cited, 14
milliseconds." Point at LatencyHud p50/p95.

## 0:50 Redirect (20s)
"Watch the human steer." Type "actually check the replica lag first." Agent re-queries,
updates the feed. Presence avatars + typing live.

## 1:10 Kill / resume (25s)
"Now kill the agent." Close the worker, successor joins: "it replays the checkpoint,
not the interrogation." `?fixture=1` fallback shown: canned docs, zero retrieval spend.

## 1:35 Co-sign (25s)
Propose DB failover → 1/2 blocked. Second human ratifies same payload hash → 2/2
executes. "Fail-closed: same human twice, wrong hash, or expired window all deny."

## 1:50 Metrics + close (15s)
Handoff → close without ACK → **409**. ACK → close → 200. Metrics tiles green, tripwire
passing. "Baton: hand over the incident, not the guesswork."
