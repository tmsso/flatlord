ALTER TABLE "statements" DROP CONSTRAINT "statements_tenancy_period_unique";--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "statements_tenancy_period_unique" ON "statements" USING btree ("tenancy_id","period_month") WHERE voided_at is null;