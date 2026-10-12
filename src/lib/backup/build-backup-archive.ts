import "server-only";
import { ZipArchive } from "archiver";
import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { rowsToCsv } from "./rows-to-csv";

// v2 (2026-10-12): the export is scoped to the caller (see below) and the
// manifest lists tables the caller's role may not read at all.
const MANIFEST_VERSION = 2;

export interface BuildBackupArchiveOptions {
  dataOnly: boolean;
  /** auth.users id of the requesting owner — the export is what they can see. */
  userId: string;
}

// Builds the whole zip in memory before returning it — deliberately not
// streamed to the response despite CLAUDE.md §3.10's "zip streamed to
// browser" wording. With today's small table set and no Storage assets yet,
// a true stream has a worse failure mode than the memory it would save: once
// bytes start flowing the HTTP status is already 200, so a query that throws
// halfway through would ship a silently truncated "successful" backup — the
// one thing this feature must never do. Revisit once real asset files make
// the memory tradeoff real (see the plan for this milestone).
export async function buildBackupArchive({ dataOnly, userId }: BuildBackupArchiveOptions): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });

  const tableNames: string[] = [];
  const skippedTables: string[] = [];

  // `db` connects as the database owner, which bypasses RLS — read as-is it
  // exported every owner's data to any owner (found 2026-10-12, owner
  // isolation batch). So every read runs in one transaction that drops to
  // the `authenticated` role with the caller's JWT claims: RLS (incl.
  // migration 0032's owner isolation) then decides row by row, exactly as
  // for the app itself. The complete, all-owners copy is the nightly
  // GitHub backup (scripts/backup-prod.sh), not this button.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local role authenticated`);
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`,
    );

    // Iterate the schema itself rather than a hand-maintained table list, so
    // new tables are covered automatically as later phases add them.
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      if (config.schema === "auth") continue; // Supabase-managed, not app data — see plan.

      let rows: Record<string, unknown>[];
      try {
        // Savepoint per table: a table the role has no GRANT on aborts only
        // its own savepoint, not the whole export.
        rows = (await tx.transaction(async (sp) => sp.select().from(value))) as Record<string, unknown>[];
      } catch (err) {
        if (isPermissionDenied(err)) {
          skippedTables.push(config.name);
          continue;
        }
        throw err;
      }
      tableNames.push(config.name);
      archive.append(JSON.stringify(rows, null, 2), { name: `tables/${config.name}.json` });
      archive.append(rowsToCsv(rows), { name: `tables/${config.name}.csv` });
    }
  });

  // Assets folder (photos/scans) intentionally not populated: no Storage
  // buckets exist in this app yet (see plan) — dataOnly is wired through so
  // it's a no-op either way today, and starts doing real work once Phase 2
  // adds Storage without needing this route to change.
  const manifest = {
    version: MANIFEST_VERSION,
    exportedAt: new Date().toISOString(),
    dataOnly,
    scope: "caller",
    tables: tableNames,
    skippedTables,
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

  await archive.finalize();
  return finished;
}

function isPermissionDenied(err: unknown): boolean {
  // postgres-js surfaces SQLSTATE as `code`; drizzle may wrap it in `cause`.
  const codeOf = (e: unknown) => (e && typeof e === "object" && "code" in e ? (e as { code: unknown }).code : undefined);
  return codeOf(err) === "42501" || codeOf((err as { cause?: unknown })?.cause) === "42501";
}
