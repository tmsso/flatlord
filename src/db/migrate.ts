import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error("SUPABASE_DB_URL is not set — see .env.example");
}

async function main() {
  const client = postgres(connectionString!, { max: 1, prepare: false });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./supabase/migrations" });
  await client.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
