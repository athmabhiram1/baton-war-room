---
kind: finding
priority: 3
id: comms-template
title: Incident Communications Template
---

# Incident Communications Template

Good comms reduce support load more than any code fix. Every SEV1 or user-facing SEV2 needs external update within 15 minutes of declaration, then every 30 minutes until resolved.

Internal war-room format: `IMPACT: <who/what> | SINCE: <UTC> | CAUSE: <hypothesis or investigating> | MITIGATION: <action + ETA> | NEXT UPDATE: <time>`. Keep messages under 40 words. Link dashboard and status page.

Status page template: Title — Brief phrase like "Checkout delays". Update 1 — "We are investigating elevated errors affecting checkout. Impact started 09:12 UTC. Next update 09:45 UTC." Update 2 — "We have identified cause as database failover and are rerouting traffic. Errors declining." Resolution — "Service restored 10:05 UTC. Root cause was DNS misconfiguration. Postmortem will be published within 5 business days."

Customer support macro should mirror status page but add workaround if available. Executive summary needs business impact: affected orders, revenue at risk, and ETA. Do not speculate on root cause in external comms; use "investigating" until IC confirms.

Close comms only after SRE confirms metrics stable for 15 minutes. Archive thread summary with decision log for postmortem. Mark as `kind:finding` priority 3 for recall.
