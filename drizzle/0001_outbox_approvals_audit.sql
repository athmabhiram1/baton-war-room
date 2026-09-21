-- Baton war-room W1 migration: outbox + approvals + audit_log (plan.md §4 W1, §8).
-- Canonical record of the Drizzle schema in ../lib/db.ts. Idempotent so it can
-- be re-applied safely. Apply via `drizzle-kit push` (schema source of truth)
-- against DATABASE_URL_UNPOOLED; this file documents the exact DDL + RLS.
-- Tenant model: the war-room id IS the tenant, stored in `tenant_id`.
-- RLS helper: warRoomId() in ../lib/db.ts sets app.tenant_id per transaction.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Outbox (Postgres SKIP LOCKED — no Redis). Reconciler claims rows with
-- FOR UPDATE SKIP LOCKED ordered by next_run_at (see claimOutbox).
CREATE TABLE IF NOT EXISTS "outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL,
  "kind" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "next_run_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Approvals (co-sign: distinct humans, same payload_hash, W-window, fail-closed).
CREATE TABLE IF NOT EXISTS "approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL,
  "action" text NOT NULL,
  "payload_hash" text NOT NULL,
  "proposer" text NOT NULL,
  "ratifier" text,
  "status" text NOT NULL DEFAULT 'pending',
  "window_ends_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Audit log (append-only; isolation_violation DENY events land here, plan §2 S3).
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL,
  "event" text NOT NULL,
  "details" jsonb,
  "ts" timestamptz NOT NULL DEFAULT now()
);

-- Composite indexes leading tenant_id (per-room scoping on every hot path).
CREATE INDEX IF NOT EXISTS "outbox_tenant_status_idx" ON "outbox" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "approvals_tenant_status_idx" ON "approvals" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "audit_tenant_ts_idx" ON "audit_log" ("tenant_id", "ts");

-- Reconciler sweep index: pending/claimed rows ordered by recency.
CREATE INDEX IF NOT EXISTS "outbox_status_updated_idx" ON "outbox" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "approvals_status_updated_idx" ON "approvals" ("status", "updated_at");

-- Row-level security: every row scoped by tenant_id to the server-derived
-- war-room id (lib/db.ts warRoomId()). Fail-closed: no context => no rows.
ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "outbox";
CREATE POLICY "tenant_isolation" ON "outbox"
  FOR ALL USING ("tenant_id" = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "approvals";
CREATE POLICY "tenant_isolation" ON "approvals"
  FOR ALL USING ("tenant_id" = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS "tenant_isolation" ON "audit_log";
CREATE POLICY "tenant_isolation" ON "audit_log"
  FOR ALL USING ("tenant_id" = current_setting('app.tenant_id', true));
