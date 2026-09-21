// Baton war-room Postgres client (plan.md §4 W1 + §8).
// Pooled DATABASE_URL via @neondatabase/serverless for app traffic;
// unpooled DATABASE_URL_UNPOOLED (neon http) for migrations.
// Env values are read from process.env only — never hardcoded, never logged.
// Docs: https://neon.com/docs/guides/drizzle.md (Context7: /drizzle-team/drizzle-orm-docs,
// /neondatabase/serverless). Commit message must cite these links.
import { neon, Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Schema. Storage tenant column is `tenant_id`; the war-room id IS the tenant.
// JS-level name stays roomId so call sites read naturally (plan §5: RLS,
// DENY+log cross-room). Mirrors drizzle/0001_outbox_approvals_audit.sql.
// ---------------------------------------------------------------------------

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: text("tenant_id").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRunAt: timestamp("next_run_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("outbox_tenant_status_idx").on(t.roomId, t.status),
    index("outbox_status_updated_idx").on(t.status, t.updatedAt),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: text("tenant_id").notNull(),
    action: text("action").notNull(),
    payloadHash: text("payload_hash").notNull(),
    proposer: text("proposer").notNull(),
    ratifier: text("ratifier"),
    status: text("status").notNull().default("pending"),
    windowEndsAt: timestamp("window_ends_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("approvals_tenant_status_idx").on(t.roomId, t.status),
    index("approvals_status_updated_idx").on(t.status, t.updatedAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: text("tenant_id").notNull(),
    event: text("event").notNull(),
    details: jsonb("details"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_tenant_ts_idx").on(t.roomId, t.ts)],
);

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

// App traffic: pooled URL (neon skill: pooled for web/serverless).
export const pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
export const db = drizzleServerless({ client: pool });

// Migrations/admin: direct (unpooled) URL — PgBouncer transaction mode must
// not front DDL. Used by drizzle-kit (drizzle.config.ts) and scripts.
const unpooledSql = neon(requiredEnv("DATABASE_URL_UNPOOLED"));
export const migrationDb = drizzleHttp({ client: unpooledSql });

// ---------------------------------------------------------------------------
// RLS helper. Policies in 0001 scope every row with
//   USING (tenant_id = current_setting('app.tenant_id', true))
// so each query runs with the server-derived war-room id (plan §5).
// set_config(..., true) is transaction-local, safe on pooled connections.
// ---------------------------------------------------------------------------

/** SQL expression for the current war-room tenant (use inside queries). */
export function warRoomId() {
  return sql<string>`current_setting('app.tenant_id', true)`;
}

export type WarRoomTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withWarRoom<T>(
  roomId: string,
  fn: (tx: WarRoomTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.tenant_id', ${roomId}, true)`,
    );
    return fn(tx);
  });
}

// ---------------------------------------------------------------------------
// Outbox (Postgres SKIP LOCKED — no Redis, plan §5). Claim disabled rows via
// FOR UPDATE SKIP LOCKED so concurrent reconcilers never double-deliver.
// ---------------------------------------------------------------------------

export async function enqueueOutbox(input: {
  roomId: string;
  kind: string;
  payload: unknown;
}) {
  return withWarRoom(input.roomId, async (tx) => {
    const [row] = await tx.insert(outbox).values(input).returning();
    if (!row) throw new Error("outbox insert returned no row");
    return row;
  });
}

export async function claimOutbox(input: { roomId: string; limit?: number }) {
  const limit = input.limit ?? 1;
  return withWarRoom(input.roomId, async (tx) => {
    const rows = await tx
      .select()
      .from(outbox)
      .where(
        sql`${outbox.roomId} = ${input.roomId} AND ${outbox.status} = 'pending' AND ${outbox.nextRunAt} <= now()`,
      )
      .orderBy(outbox.nextRunAt)
      .limit(limit)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      await tx
        .update(outbox)
        .set({
          status: "claimed",
          attempts: row.attempts + 1,
          updatedAt: new Date(),
        })
        .where(sql`${outbox.id} = ${row.id}`);
    }
    return rows;
  });
}

export async function ackOutbox(id: string) {
  await db
    .update(outbox)
    .set({ status: "acked", updatedAt: new Date() })
    .where(sql`${outbox.id} = ${id}`);
}

// ---------------------------------------------------------------------------
// Approvals (co-sign: distinct humans, same payloadHash, W-window, fail-closed)
// ---------------------------------------------------------------------------

export async function requestApproval(input: {
  roomId: string;
  action: string;
  payloadHash: string;
  proposer: string;
  windowEndsAt: Date;
}) {
  return withWarRoom(input.roomId, async (tx) => {
    const [row] = await tx.insert(approvals).values(input).returning();
    if (!row) throw new Error("approval insert returned no row");
    return row;
  });
}

export async function ratifyApproval(input: { id: string; ratifier: string }) {
  const [row] = await db
    .select()
    .from(approvals)
    .where(sql`${approvals.id} = ${input.id}`);
  if (!row) throw new Error("approval not found");
  if (row.status !== "pending") throw new Error("approval not pending");
  if (row.ratifier) throw new Error("approval already ratified");
  if (input.ratifier === row.proposer) {
    throw new Error("ratifier must differ from proposer (fail-closed)");
  }
  if (new Date() > row.windowEndsAt) {
    throw new Error("co-sign window expired (fail-closed)");
  }
  const [updated] = await db
    .update(approvals)
    .set({ ratifier: input.ratifier, status: "ratified", updatedAt: new Date() })
    .where(sql`${approvals.id} = ${input.id}`)
    .returning();
  if (!updated) throw new Error("ratify returned no row");
  return updated;
}

export async function approvalQuorum(input: { id: string }) {
  const [row] = await db
    .select()
    .from(approvals)
    .where(sql`${approvals.id} = ${input.id}`);
  if (!row) return false;
  return (
    row.status === "ratified" &&
    row.ratifier !== null &&
    row.ratifier !== row.proposer
  );
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export async function logAudit(input: {
  roomId: string;
  event: string;
  details?: unknown;
}) {
  return withWarRoom(input.roomId, async (tx) => {
    const [row] = await tx
      .insert(auditLog)
      .values({ roomId: input.roomId, event: input.event, details: input.details ?? null })
      .returning();
    if (!row) throw new Error("audit insert returned no row");
    return row;
  });
}
