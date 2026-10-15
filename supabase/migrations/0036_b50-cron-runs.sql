-- B-50: durable cron run log (see src/db/schema/cron-runs.ts). Service role
-- only: RLS on with no policies, and no grants to app roles (the dev
-- project's default ACL would otherwise hand them table privileges).
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cron_runs_status_check" CHECK ("cron_runs"."status" in ('running', 'ok', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "cron_runs_job_started_at_idx" ON "cron_runs" USING btree ("job","started_at");--> statement-breakpoint
ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON cron_runs FROM anon, authenticated;
