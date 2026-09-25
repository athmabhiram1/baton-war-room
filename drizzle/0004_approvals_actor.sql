-- Wave 3 T5 approvals actor binding (docs/BACKEND_PLAN.md): bind every
-- approval row to its Neon Auth identity. Adds approvals.actor_id UUID NOT
-- NULL REFERENCES neon_auth."user"(id) plus a nullable ratifier_id FK to the
-- same table. Mirrors the actorId/ratifierId columns in ../lib/db.ts.
-- TYPE NOTE: the plan draft said TEXT, but live introspection
-- (DATABASE_URL_UNPOOLED, information_schema) shows neon_auth."user".id is
-- uuid — a TEXT FK would fail with a datatype mismatch, so the columns are
-- uuid. Session user ids are uuids in production, so this matches.
-- Apply via `drizzle-kit push` (schema source of truth) against
-- DATABASE_URL_UNPOOLED (direct, never the -pooler URL); this file documents
-- the exact DDL. Idempotent so it can be re-applied safely.
--
-- DATA CHOICE (user-approved): pre-prod approval rows are WIPED, not
-- backfilled. Rationale: pre-prod rows carry free-text proposer names with no
-- trustworthy mapping to neon_auth user ids; guessing ids would forge
-- quorum provenance. The table holds only pending co-sign state (durable
-- history lives in audit_log, untouched by this migration), so DELETE is
-- lossless for any real record. Production cutover must run this wipe in the
-- same deploy that ships the session-bound route.

-- Neon Auth owns the neon_auth schema (users/sessions live inside our own
-- Postgres per the plan). The FK target below matches the plan contract
-- `actor_id NOT NULL → neon_auth.user.id`; if `drizzle-kit pull`
-- introspection shows a different user table name on this branch, rename the
-- REFERENCES target before applying to production.
DELETE FROM "approvals";

ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "actor_id" uuid;
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "ratifier_id" uuid;

-- Backfill guard: with the wipe above there are no legacy rows, so NOT NULL
-- applies cleanly. (If this migration is ever re-run against a table that
-- regained NULL actor_id rows, the ALTER will fail closed — fix the rows,
-- do not drop the constraint.)
ALTER TABLE "approvals" ALTER COLUMN "actor_id" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approvals_actor_id_fk'
  ) THEN
    ALTER TABLE "approvals" ADD CONSTRAINT "approvals_actor_id_fk"
      FOREIGN KEY ("actor_id") REFERENCES neon_auth."user"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approvals_ratifier_id_fk'
  ) THEN
    ALTER TABLE "approvals" ADD CONSTRAINT "approvals_ratifier_id_fk"
      FOREIGN KEY ("ratifier_id") REFERENCES neon_auth."user"("id");
  END IF;
END $$;
