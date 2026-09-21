---
kind: todo
priority: 4
id: disk-full
title: Disk Full on Node
---

# Disk Full on Node

Disk full triggers pod evictions, `no space left on device` errors, and failed writes to logs or temp files. Diagnose with `df -h`, `du -sh /var/log/*`, and `kubectl describe node` for allocatable pressure. Identify largest consumers: container logs, image layers, temp uploads, or database WAL.

Immediate relief: rotate logs `logrotate -f` or `journalctl --vacuum-size=500M`, prune unused images `docker image prune -af` or `crictl rmi --prune`, and clear `/tmp`. If disk is WAL or DB volume, do not delete manually; trigger WAL archive or scale storage. Move node to `cordon` to avoid new scheduling: `kubectl cordon <node>`.

Prevent recurrence: set log retention 7 days plus max size 100MB, enable image GC threshold 80 percent, and mount ephemeral volumes with `emptyDir` size limit. Add alert at 75 percent usage, not 90. After relief, `uncordon` node and verify pods reschedule.

Verify recovery with `df` dropping below 70 percent for 10 minutes and pod `Ready` status. Document cause and culprit directory as `kind:todo` priority 4 for capacity planning.

If root cause is runaway application logging, fix log level first.
