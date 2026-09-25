-- Wave 2 T4 rooms (docs/BACKEND_PLAN.md): join-by-code only. `ensure`
-- auto-creates on first join; `join` requires an existing code. No lobby
-- list, no invites, no codeless create. Code format stays war-<id> for
-- RoomProvider + liveblocks-auth regex compatibility.
-- Canonical record of the rooms/room_members tables in ../lib/db.ts.
-- Idempotent so it can be re-applied safely. Apply via `drizzle-kit push`
-- (schema source of truth) against DATABASE_URL_UNPOOLED; this file
-- documents the exact DDL.

CREATE TABLE IF NOT EXISTS "rooms" (
  "code" text PRIMARY KEY CHECK ("code" ~ '^war-[A-Za-z0-9_-]{1,64}$'),
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "room_members" (
  "room_code" text NOT NULL REFERENCES "rooms"("code"),
  "user_id" text NOT NULL,
  "role" text NOT NULL DEFAULT 'Observer',
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("room_code", "user_id")
);
