import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// SUPABASE_DB_URL points at a real Supabase project's Postgres connection
// string. There is no local database on this node — see project memory:
// local Supabase (`supabase start`) is unavailable here and must not be
// attempted; all connections target a cloud project.
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DB_URL is not set — see .env.example");
}

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
