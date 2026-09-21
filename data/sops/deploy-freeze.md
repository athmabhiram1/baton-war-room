---
kind: decision
priority: 4
id: deploy-freeze
title: Deploy Freeze Procedure
---

# Deploy Freeze Procedure

Deploy freeze protects the incident window from collateral changes. IC alone can activate or lift a freeze. Freeze applies to all services in the affected blast radius and to any shared infra like database or edge config.

Activation: post `/freeze on reason:<incident-id> scope:<services>` in #deploys and war-room. Pipeline will reject new deploys with error "frozen by IC". Emergency deploys require explicit IC approval and must be announced with risk assessment. Freeze is recorded as `kind:decision` priority 4 for audit.

During freeze, keep build pipeline green by running CI on branches without deploying. SRE validates that freeze does not block rollback; rollback is exempted from freeze. Cache the last known good artifact tag and its test report link.

Lifting criteria: incident resolved and stable for 15 minutes, or IC explicitly lifts for a verified hotfix. Lift command is `/freeze off reason:<resolution>`. After lift, deploy queue resumes in FIFO with reviewer checks. Document freeze duration and any bypasses for postmortem. Never leave freeze overnight without daily reassessment. If freeze exceeds 4 hours, escalate to engineering director for staffing.

Automated tripwire alerts if deploy attempts occur during freeze.
