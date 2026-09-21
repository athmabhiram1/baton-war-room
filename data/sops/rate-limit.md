---
kind: decision
priority: 3
id: rate-limit
title: Rate Limit Tuning
---

# Rate Limit Tuning

Rate limits protect origin from abuse but can cause self-inflicted 429 spike when misconfigured. Check whether 429 rate correlates with traffic shape, bot burst, or tight limit change. Review gateway logs for top clients by 429 count and verify legitimate traffic is not blocked.

Tuning steps: if global limit is throttling legitimate users, raise per-IP or per-user bucket 20 percent and increase burst allowance. Prefer token bucket over fixed window for smoother traffic. If abuse is real, tighten limit for offending ASN or user-agent and enable challenge page. Never raise limit above origin capacity without load test.

Apply changes via config push with canary 10 percent before global. Monitor 429 rate drop and downstream CPU together; raising limit should not spike DB load above 60 percent. Document decision with before and after thresholds as `kind:decision` priority 3 for audit.

Post-incident, set limit as `max_sustained_rps * 1.2` plus burst `peak * 2`. Add alert when 429 exceeds 1 percent of traffic. Link rate limit change to deploy freeze decision if needed.

Verify recovery: p75 latency stable and no queue backlog growth after tuning.
