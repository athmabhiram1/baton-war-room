---
kind: todo
priority: 4
id: handoff-template
title: Shift Handoff Template
---

# Shift Handoff Template

No war-room closes without explicit ACK. Handoff prevents repeat questions and lost context when primary responder fatigue sets in. Trigger handoff every 30 minutes in SEV1, every 60 minutes in SEV2, or on explicit request.

Pre-handoff checklist: Scribe ensures logbook has chronological entries with timestamps, decisions tagged `kind:decision`, and pending todos with owners. Successor reviews dashboard snapshots, open hypotheses, and rollback readiness. Current IC states: impact, what has been tried, what is pending, and what must not be retried.

Handoff payload: `roomId`, `incidentId`, `summary` (2 sentences), `openQuestions[]`, `pendingTodos[]`, `decisions[]`, `nextSteps`. Successor must send ACK message containing hash of payload and phrase "taking ownership". Until ACK is recorded, originator remains responsible and close attempts return 409 PENDING_HANDOFF.

Successor resumes by querying recall for high-priority decisions and findings filtered to this roomId, then pushes checkpoint via `pushIndex` so future successors have durable state. Verify handoff by asking successor to restate incident cause hypothesis without prompting. Log ACK in audit trail with both actors. Tag handoff docs `kind:todo` priority 4.
