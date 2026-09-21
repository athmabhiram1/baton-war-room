---
kind: finding
priority: 4
id: cache-stampede
title: Cache Stampede Mitigation
---

# Cache Stampede Mitigation

Cache stampede occurs when hot key expiry or cache flush causes thousands of concurrent cache misses hitting origin and database simultaneously. Symptoms: latency spike, database CPU 90 percent plus, hit ratio drop from 95 to below 20 percent.

Immediate mitigation: enable stale-while-revalidate with `stale-ttl` 60 seconds if supported, or serve stale snapshot from CDN. Add request coalescing `singleflight` around hot keys so only one goroutine fetches per key. Increase cache TTL randomly jittered between 5 and 15 minutes to avoid thundering herd on next expiry. If already in progress, throttle refill with token bucket at 10 percent of normal fetch rate.

Longer fix: use probabilistic early recompute where TTL remaining percent below 10 triggers background refresh before expiry. Implement `SET NX` lock for refill with 5 second lease. Pre-warm cache after rollback or failover by replaying top 100 keys from access log.

Monitoring: alert on hit ratio drop below 80 percent and miss rate surge. Post-incident, analyze key distribution and move hottest keys to replicated cache shard. Document findings as `kind:finding` priority 4. Verify recovery by watching miss rate return under 10 percent and p95 normalize before lifting deploy freeze.
