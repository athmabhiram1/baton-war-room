---
kind: finding
priority: 5
id: 5xx-spike
title: 5xx Spike Response
---

# 5xx Spike Response

Sudden 5xx spike usually correlates with bad deploy, downstream timeout, or resource exhaustion. Start with service dashboard: 5xx rate, top endpoints, error codes, and latency histogram. Correlate with deploy timeline and infra events.

Diagnosis matrix: if all endpoints 5xx plus connection refused, check pod readiness and service mesh. If single endpoint, review that handler's dependencies and recent code changes. If downstream timeout, inspect dependency SLO and apply circuit breaker. Sample error logs for stack trace and request IDs.

Mitigation: if deploy-correlated, rollback per rollback.md. If downstream, fail open with cached response or static fallback, and shed load via rate limit. Scale pods if CPU saturated, but verify not amplifying downstream overload.

Verification: watch 5xx rate drop below 0.5 percent for 10 minutes, run synthetic happy path, and confirm customer success events recovery. Keep incident open until error budget burn stops per slo-burn SOP.

Document root cause classification and mitigation chosen as `kind:finding` priority 5 for pattern recall. Add canary deploy gate to prevent recurrence.
