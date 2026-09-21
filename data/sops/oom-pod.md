---
kind: finding
priority: 4
id: oom-pod
title: OOMKilled Pod Recovery
---

# OOMKilled Pod Recovery

OOMKilled pods show `Reason: OOMKilled` and exit code 137, often accompanied by rising heap and GC pressure. Get details via `kubectl get pod -o yaml`, `kubectl top pod`, and application heap dump if available. Check if limit is too low versus usage or if leak caused growth.

Immediate fix: raise memory limit 50 percent via deploy patch and rollout restart. If using HPA, verify HPA not memory-throttled. For Java or Node, capture heap dump before restart: `jmap -dump` or `node --heapsnapshot`. For Go, collect `pprof` heap.

Diagnosis: compare heap profile between stable and failing revision. Look for unbounded caches, goroutine leaks, or large payload allocations. If leak is confirmed, apply flag kill to disable feature branch and rollback.

Stabilization: set requests equal to 80 percent of limits to avoid overcommit, enable `evictionHard` at 85 percent, and add alert on `container_memory_working_set_bytes` above 90 percent of limit for 5 minutes. Document finding as `kind:finding` priority 4.

Recovery proof is pod running without restart for 15 minutes and p95 stable. Schedule load test for leak reproduction before closing postmortem.
