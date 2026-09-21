---
kind: todo
priority: 5
id: rollback
title: Rollback Runbook
---

# Rollback Runbook

Rollback is the default mitigation for deploy-correlated incidents. Prefer rollback over forward fix unless forward fix is a one-line flag kill with known success probability above 90 percent. Rollback must complete within 10 minutes of IC decision.

Pre-checks: confirm artifact to roll back to passed CI and was last known good in production. Verify no stateful migration ran that cannot be reversed; if irreversible migration shipped, escalate to DB failover and do not auto-rollback without DB owner approval. Announce rollback in #deploys and war-room with version tags.

Steps: lock deploy pipeline (`deploy-freeze` SOP), run `deploy rollback --env prod --to <prev-tag>`, monitor rollout via `kubectl rollout status` and health probes. Watch 5xx and latency for 5 minutes. If rollback fails or error rate does not halve, escalate to senior SRE and consider traffic drain to standby.

Post-rollback: tag incident with rolled version and offending commit. Keep rolled commit blocked until postmortem assigns fix. Resume deploy freeze until IC lifts it explicitly; never auto-unfreeze. Document rollback duration, verification signals, and any manual data reconciliation needed. Cache stampede may follow; warm caches per cache-stampede SOP before declaring recovered. Record rollback as `kind:todo` priority 5.
