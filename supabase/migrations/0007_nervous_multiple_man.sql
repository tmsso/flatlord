CREATE TYPE "public"."charge_type_kind" AS ENUM('fixed', 'metered', 'tracked_only', 'one_off');--> statement-breakpoint
CREATE TYPE "public"."meter_reading_source" AS ENUM('tenant', 'admin', 'import');--> statement-breakpoint
CREATE TYPE "public"."meter_reading_status" AS ENUM('submitted', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'cash', 'revolut', 'other');--> statement-breakpoint
CREATE TYPE "public"."registration_type" AS ENUM('main_address', 'temporary', 'casual', 'owner_agent');--> statement-breakpoint
CREATE TYPE "public"."statement_status" AS ENUM('draft', 'issued', 'partially_paid', 'paid', 'overdue');--> statement-breakpoint
CREATE TABLE "field_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text DEFAULT 'person' NOT NULL,
	"field_name" text NOT NULL,
	"registration_type" "registration_type",
	"required" boolean NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "charge_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"kind" charge_type_kind NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"unit" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charge_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"charge_type_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"amount_huf" bigint,
	"rate_huf_per_unit" numeric(12, 4),
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"charge_type_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"amount_huf" bigint NOT NULL,
	"reason" text NOT NULL,
	"target_month" date NOT NULL,
	"target_month_end" date,
	"voided_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "target_month_end_after_start" CHECK ("adjustments"."target_month_end" is null or "adjustments"."target_month_end" >= "adjustments"."target_month"),
	CONSTRAINT "target_month_is_month_start" CHECK (date_trunc('month', "adjustments"."target_month") = "adjustments"."target_month"),
	CONSTRAINT "target_month_end_is_month_start" CHECK ("adjustments"."target_month_end" is null or date_trunc('month', "adjustments"."target_month_end") = "adjustments"."target_month_end")
);
--> statement-breakpoint
CREATE TABLE "meters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"charge_type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"base_value" numeric(14, 3) NOT NULL,
	"installed_at" date NOT NULL,
	"removed_at" date,
	"replaces_meter_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meter_id" uuid NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"reading_date" date NOT NULL,
	"entered_value" numeric(14, 3) NOT NULL,
	"entered_by" uuid NOT NULL,
	"ocr_value" numeric(14, 3),
	"ocr_confidence" numeric(4, 3),
	"confirmed_value" numeric(14, 3),
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"photo_path" text,
	"status" "meter_reading_status" DEFAULT 'submitted' NOT NULL,
	"source" "meter_reading_source" DEFAULT 'tenant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"period_month" date NOT NULL,
	"status" "statement_status" DEFAULT 'draft' NOT NULL,
	"due_date" date,
	"total_huf" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'HUF' NOT NULL,
	"issued_snapshot" jsonb,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statements_tenancy_period_unique" UNIQUE("tenancy_id","period_month")
);
--> statement-breakpoint
CREATE TABLE "statement_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"tenancy_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"charge_type_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3),
	"unit_rate_huf" numeric(12, 4),
	"amount_huf" bigint NOT NULL,
	"is_billable" boolean DEFAULT true NOT NULL,
	"charge_schedule_id" uuid,
	"meter_id" uuid,
	"from_reading_id" uuid,
	"to_reading_id" uuid,
	"adjustment_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"tenancy_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"amount_huf" bigint NOT NULL,
	"currency" char(3) DEFAULT 'HUF' NOT NULL,
	"paid_at" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"note" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenancies" ADD COLUMN "primary_tenant_registration_type" "registration_type";--> statement-breakpoint
ALTER TABLE "tenancies" ADD COLUMN "meter_reading_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenancy_occupants" ADD COLUMN "registration_type" "registration_type";--> statement-breakpoint
ALTER TABLE "charge_types" ADD CONSTRAINT "charge_types_unit_id_properties_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_schedules" ADD CONSTRAINT "charge_schedules_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_schedules" ADD CONSTRAINT "charge_schedules_charge_type_id_charge_types_id_fk" FOREIGN KEY ("charge_type_id") REFERENCES "public"."charge_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_charge_type_id_charge_types_id_fk" FOREIGN KEY ("charge_type_id") REFERENCES "public"."charge_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_created_by_persons_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_unit_id_properties_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_charge_type_id_charge_types_id_fk" FOREIGN KEY ("charge_type_id") REFERENCES "public"."charge_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_replaces_meter_id_meters_id_fk" FOREIGN KEY ("replaces_meter_id") REFERENCES "public"."meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_entered_by_persons_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_confirmed_by_persons_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line_items" ADD CONSTRAINT "statement_line_items_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line_items" ADD CONSTRAINT "statement_line_items_charge_type_id_charge_types_id_fk" FOREIGN KEY ("charge_type_id") REFERENCES "public"."charge_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line_items" ADD CONSTRAINT "statement_line_items_charge_schedule_id_charge_schedules_id_fk" FOREIGN KEY ("charge_schedule_id") REFERENCES "public"."charge_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line_items" ADD CONSTRAINT "statement_line_items_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line_items" ADD CONSTRAINT "statement_line_items_from_reading_id_meter_readings_id_fk" FOREIGN KEY ("from_reading_id") REFERENCES "public"."meter_readings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line_items" ADD CONSTRAINT "statement_line_items_to_reading_id_meter_readings_id_fk" FOREIGN KEY ("to_reading_id") REFERENCES "public"."meter_readings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line_items" ADD CONSTRAINT "statement_line_items_adjustment_id_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_persons_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;