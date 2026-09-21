---
kind: todo
priority: 5
id: db-failover
title: Database Failover Runbook
---

# Database Failover Runbook

Database failover is needed when primary Postgres is unreachable, replication lag exceeds 60 seconds, or write errors spike. Confirm via Neon dashboard, `pg_isready`, and application connection pool errors before declaring failover.

Steps: drain writes by enabling maintenance flag if possible. Promote standby with `neonctl branches promote --project <id>` or console promote. Verify standby lag is zero via `SELECT pg_last_wal_replay_lag()`. Update pooled DATABASE_URL secret and restart app via `vercel redeploy` or rolling restart. Validate with `SELECT 1` probe and write test inserting a canary row in outbox table.

If promote fails, fall back to unpooled direct URL as diagnostic and escalate to Neon support. After failover, replay outbox with `SELECT FOR UPDATE SKIP LOCKED` to drain pending jobs; monitor for duplicate processing. Reconcile approvals and audit tables for split-brain writes by comparing sequence numbers.

Recovery actions: re-establish standby replication, re-enable writes, warm caches, and run `vacuum analyze` if needed. Document failover duration, data loss window, and queries affected. Tag as `kind:todo` priority 5. Schedule capacity review because failover often reveals under-provisioned pool sizing.
