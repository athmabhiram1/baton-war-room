---
kind: decision
priority: 5
id: sev1-triage
title: SEV1 Triage Runbook
---

# SEV1 Triage Runbook

SEV1 indicates total service loss or data integrity risk. Declare SEV1 when error rate exceeds 50 percent, checkout or auth is fully blocked, or customer data may be corrupted. Page primary and secondary on-call immediately via PagerDuty; do not wait for aggregation. Freeze all non-emergency deploys in the incident Slack channel with `/freeze`.

First five minutes: establish war-room bridge, assign Incident Commander (IC), Scribe, and Comms Lead by name. IC owns decisions; Scribe logs every decision with UTC timestamp, actor, and rationale. Verify blast radius via dashboards: request rate, 5xx, p95 latency, saturation, and queue depth. Capture screenshot of burn-down charts for postmortem timeline.

Next ten minutes: isolate fault domain. Check recent deploys, feature flags, infra changes, and dependency health. If last deploy correlates, prepare rollback per rollback.md rather than forward fix. Run read-only diagnostics only; do not mutate production until IC approves. Communicate externally within 15 minutes using the comms template with status page update.

Handoff every 30 minutes using the handoff template. No SEV1 closes without explicit ACK from successor and IC. Recovery is declared only when SLO burn stops, synthetic probes pass for 10 minutes, and customer impact metric returns to baseline. Schedule postmortem within 24 hours.
