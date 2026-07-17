ALTER TABLE "tenancies" ALTER COLUMN "unit_type" SET DEFAULT 'flat';--> statement-breakpoint
ALTER TABLE "tenancies" ALTER COLUMN "property_id" SET DEFAULT gen_random_uuid();