---
kind: decision
priority: 5
id: escalation-matrix
title: Escalation Matrix
---

# Escalation Matrix

Escalation matrix ensures the right expert is paged within minutes, not hours. Primary on-call owns SEV2 for first 30 minutes; if unresolved, escalate to secondary. SEV1 pages both primary and secondary immediately plus engineering manager.

Tier order: L1 on-call SRE, L2 service owner, L3 domain architect, L4 director. Each tier has 10 minute acknowledgment SLA; if no ACK, auto-escalate to next tier. Use PagerDuty escalation policy, not manual Slack ping.

Specialist routing: DB issues escalate to DBRE team, auth to identity team, network and DNS to infra, payments to payments on-call. For customer impact exceeding 1000 users or revenue at risk above threshold, also notify comms lead and customer success manager.

Handoff between tiers requires same payload as war-room handoff: summary, open questions, and explicit ACK. Never escalate without including incident channel link, dashboard snapshot, and recent decision log. Record escalation event as `kind:decision` priority 5 for isolation audit.

After business hours, L4 escalation may involve wake-up approval; document approval. Review matrix quarterly and after any missed escalation. Test with fire drill quarterly.

Contact rotation is in PagerDuty; do not hardcode phone numbers in runbooks.
