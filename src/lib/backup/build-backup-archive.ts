import "server-only";
import { ZipArchive } from "archiver";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { rowsToCsv } from "./rows-to-csv";

const MANIFEST_VERSION = 1;

export interface BuildBackupArchiveOptions {
  dataOnly: boolean;
}

// Builds the whole zip in memory before returning it — deliberately not
// streamed to the response despite CLAUDE.md §3.10's "zip streamed to
// browser" wording. With today's small table set and no Storage assets yet,
// a true stream has a worse failure mode than the memory it would save: once
// bytes start flowing the HTTP status is already 200, so a query that throws
// halfway through would ship a silently truncated "successful" backup — the
// one thing this feature must never do. Revisit once real asset files make
// the memory tradeoff real (see the plan for this milestone).
export async function buildBackupArchive({ dataOnly }: BuildBackupArchiveOptions): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });

  const tableNames: string[] = [];
  // Iterate the schema itself rather than a hand-maintained table list, so
  // new tables are covered automatically as later phases add them.
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    if (config.schema === "auth") continue; // Supabase-managed, not app data — see plan.

    const rows = (await db.select().from(value)) as Record<string, unknown>[];
    tableNames.push(config.name);
    archive.append(JSON.stringify(rows, null, 2), { name: `tables/${config.name}.json` });
    archive.append(rowsToCsv(rows), { name: `tables/${config.name}.csv` });
  }

  // Assets folder (photos/scans) intentionally not populated: no Storage
  // buckets exist in this app yet (see plan) — dataOnly is wired through so
  // it's a no-op either way today, and starts doing real work once Phase 2
  // adds Storage without needing this route to change.
  const manifest = {
    version: MANIFEST_VERSION,
    exportedAt: new Date().toISOString(),
    dataOnly,
    tables: tableNames,
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

  await archive.finalize();
  return finished;
}
