---
kind: todo
priority: 4
id: dns
title: DNS Incident Runbook
---

# DNS Incident Runbook

DNS failures manifest as `NXDOMAIN`, `SERVFAIL`, or intermittent resolution timeouts affecting a subset of users. Check from multiple vantage points using `dig @8.8.8.8`, `dig @1.1.1.1`, and internal resolver. Compare with `https://dnsviz.net` and registrar status.

Common causes: expired domain registration, bad CNAME change, TTL misconfiguration, or provider outage. Verify last DNS change timestamp and diff zone file. If recent change correlates, revert zone and lower TTL to 60 seconds for fast propagation, then wait 5 minutes and re-check.

If provider is down, fail traffic to secondary DNS provider if configured, or switch origin mapping via edge failover. Flush edge DNS cache and verify via global probe like whatsmydns.net. Monitor certificate validation because DNS failure can trigger TLS renewal failures.

Communication: inform users that issues may persist for TTL duration after fix. Log decision to revert or failover as `kind:todo` priority 4. Post-incident, enable DNSSEC, configure dual provider, and set calendar alert 30 days before domain expiry. Add synthetic DNS probe with 1 minute interval.

Recovery is confirmed when global resolution success exceeds 99.5 percent for 10 minutes.
