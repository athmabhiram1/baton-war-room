---
kind: todo
priority: 4
id: flag-kill
title: Feature Flag Kill Switch
---

# Feature Flag Kill Switch

Flag kill is the fastest safe mitigation when a new feature correlates with incident. Prefer kill over rollback when feature is isolated behind percentage rollout.

Steps: identify candidate flags via recent flag change log and error correlation. For each flag candidate, check kill safety: does disabled path have fallback and have tests. Kill via LaunchDarkly or internal store with `flag set <name>=off env=prod`. Announce kill in war-room with flag name, previous value, and time.

Monitor for 5 minutes: error rate should halve if flag was cause. If no improvement, re-enable flag to avoid flap and try next candidate; document negative result. Do not kill more than two flags without IC approval to avoid cascading behavior changes.

After incident, leave flag off until postmortem assigns fix and test adds regression guard. Tag flag kill as `kind:todo` priority 4 with flag name in metadata. Link kill to deploy freeze status.

Recovery check: run synthetic covering killed feature's fallback path and verify no new errors. Add flag kill button to runbook automation so next incident can kill in one click. Measure time-to-kill target under 2 minutes.
