# Demo script — Baton war-room in 2:00

Record at 1080p, 130 wpm. Keep `?fixture=1` ready as backup. Spoken lines
are quoted; actions are plain. Proof for every beat: `docs/evidence/`.

## 0:00 Friction

"Every SEV1 ends the same way. The outgoing engineer leaves, the newcomer
asks the same three questions, and the agent starts from zero."

Click: landing page, Enter room. Curl backup:

```bash
curl -X POST localhost:3112/api/query -H 'content-type: application/json' \
  -d '{"q":"SEV1 triage"}' # 200, 2+ citations, timeTakenInMs
```

## 0:20 Catch-up

"Priya joins mid-incident and asks what happened so far. The agent answers
with scored citations, not vibes."

Click: second browser, same room, ask in feed. Point at LatencyHud p50/p95.
Evidence: `docs/evidence/query-curl-body.json`.

## 0:50 Redirect

"Watch the human steer. Check replica lag first. The agent re-queries and
the feed updates."

Type the redirect in SearchBox. Presence avatars and typing stay live.

## 1:10 Kill and resume

"Now kill the agent. The successor replays the checkpoint, no interrogation."

Close worker tab, open successor, click ACK in AckModal. Curl:

```bash
curl -X POST localhost:3112/api/handoff -H 'content-type: application/json' \
  -d '{"roomId":"war-demo","action":"ack","actor":"priya"}'
```

Evidence: `docs/evidence/handoff-green.txt` (200 after ACK).

## 1:35 Co-sign

"Database failover needs two humans on one payload hash. One signature
stays blocked. Two execute."

Click: propose in CoSignTile, ratify as second human. Deny case:

```bash
curl -X POST localhost:3112/api/approvals \
  -H 'content-type: application/json' \
  -d '{"roomId":"war-demo","approvalId":"<id>","actor":"priya","payloadHash":"<hash>","step":"ratify"}'
```

Evidence: `docs/evidence/cosign-2ctx.spec.ts`.

## 1:50 Metrics and fixture

"Close without an ACK returns 409. With an ACK, 200. Metrics stay green,
and fixture mode demos with zero spend."

Curls: close before ACK shows 409 (`docs/evidence/handoff-red.txt`); then
`GET /api/metrics` and `POST /api/query?fixture=1`. "Baton: hand over the
incident, not the guesswork."
