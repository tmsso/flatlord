import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// SUPABASE_DB_URL points at a Supabase project's Postgres connection
// string — the cloud dev project for local development (this sandboxed
// dev node can't run the local Docker-based stack; see project memory),
// or the ephemeral `supabase start` instance when running in CI.
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DB_URL is not set — see .env.example");
}

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
