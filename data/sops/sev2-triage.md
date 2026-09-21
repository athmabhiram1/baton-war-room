---
kind: decision
priority: 4
id: sev2-triage
title: SEV2 Triage Runbook
---

# SEV2 Triage Runbook

SEV2 is degraded service with partial impact or elevated error rates that do not trigger SEV1 thresholds. Typical triggers: 5xx between 1 and 10 percent, p95 latency doubled, single AZ or single feature degraded, or background jobs lagging beyond SLO. File incident in Jira with severity 2 and create war-room channel `inc-sev2-YYYY-MM-DD-shortname`.

Triage owner is on-call engineer; escalation to senior only if unresolved in 30 minutes. Check whether impact is user-facing or internal batch: verify via synthetic monitors and support ticket volume. If user-facing, set status page to degraded and notify stakeholders in #incidents. If internal, mark as tracked and prioritize against deploy queue.

Diagnosis sequence: confirm metrics source is not stale, compare to 7-day baseline, inspect deploy log for last 2 hours, evaluate flag changes, and run `check-deps` for downstream availability. Collect logs with request ID correlation; do not restart pods until you have heap and goroutine dumps if memory is involved.

Mitigation may be traffic shift, flag kill, or cache warmup rather than full rollback. Document every tentative decision as `kind:decision` with priority so recall surfaces it. Handoff if the incident exceeds one hour. Closure requires metric recovery for 15 minutes and explicit note in incident channel.
