---
kind: finding
priority: 3
id: queue-backlog
title: Queue Backlog Draining
---

# Queue Backlog Draining

Queue backlog appears as consumer lag growing, oldest message age rising, and downstream latency increasing. Use `queue depth` metrics and `outbox_status` counts to quantify. Differentiate between producer surge versus consumer stall by checking consumer health and error logs.

Mitigation for consumer stall: check for poison messages by inspecting dead-letter queue; quarantine offending message id and resume. Scale consumers horizontally if CPU bound, or increase `concurrency` if I/O bound. Apply backpressure to producers via rate limit or 429 to avoid backlog amplification. For Postgres outbox, use `FOR UPDATE SKIP LOCKED` to let multiple workers claim without contention; verify claim latency under 100ms.

If backlog is producer surge from retry storm, enable exponential backoff and circuit breaker. Drain by prioritizing high-priority kinds first: `decision` and `finding` over `todo`. Monitor lag returning below 100 messages and age under 1 minute.

Post-drain, verify no duplicates caused business side effects by auditing idempotency keys. Tune alert threshold to fire at 1000 depth rather than 10000. Document as `kind:finding` priority 3. Keep consumer autoscale policy for next surge.
