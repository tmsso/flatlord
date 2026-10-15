import { pgTable, uuid, text, timestamp, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// One row per cron invocation (B-50, migration 0036). Written by the
// service role only — RLS on, no policies, so no app user can read it.
// Vercel Hobby keeps runtime logs ~30 min, so this is the durable record
// of whether a run finished and how far it got: the row is inserted as
// 'running' and updated after every phase, so a run killed by the 300 s
// limit stays 'running' with its last completed phase. The production
// health check reads the newest row (health-check.yml, cron-last-run).
//
// Operational, not domain data — deliberately no property_id.
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(), // 'daily-reminders' (Vercel Cron) | 'daily-reminders:manual'
    status: text("status").notNull().default("running"), // 'running' | 'ok' | 'failed'
    // [{ phase, ms, result }] in completion order.
    phases: jsonb("phases").notNull().default(sql`'[]'::jsonb`),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cron_runs_job_started_at_idx").on(table.job, table.startedAt),
    check("cron_runs_status_check", sql`${table.status} in ('running', 'ok', 'failed')`),
  ],
);
