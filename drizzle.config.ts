import type { Config } from "drizzle-kit";

// No live database on this node (see project memory: local Supabase is
// unavailable here). `drizzle-kit generate` only diffs the TypeScript
// schema against prior SQL files in `out` — it needs no connection.
// `drizzle-kit migrate`/`push` do need SUPABASE_DB_URL, pointed at a real
// (cloud) Supabase project.
export default {
  schema: "./src/db/schema/index.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  // Supabase owns the `auth` schema (auth.users etc.) — our schema only
  // stubs auth.users for FK typing (src/db/schema/auth.ts). Restricting to
  // `public` stops drizzle-kit from trying to CREATE SCHEMA/TABLE for
  // something that already exists on any real Supabase project.
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL ?? "",
  },
} satisfies Config;
