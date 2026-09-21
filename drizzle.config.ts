import { defineConfig } from "drizzle-kit";

// Migrations run against the DIRECT (unpooled) URL — never the -pooler URL
// (neon-postgres skill: pooled PgBouncer breaks DDL/session state).
// Docs: https://neon.com/docs/guides/drizzle.md
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
});
