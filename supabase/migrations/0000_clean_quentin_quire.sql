-- auth.users is Supabase-managed and already exists on any real project;
-- src/db/schema/auth.ts stubs it only for FK typing. Drizzle-kit has no
-- "external table" flag in this version, so the CREATE SCHEMA "auth" /
-- CREATE TABLE "auth"."users" statements it generated here were removed
-- by hand — the FK constraint further down is kept as-is.
CREATE TYPE "public"."document_type" AS ENUM('id_card', 'passport', 'residence_permit');--> statement-breakpoint
CREATE TYPE "public"."letting_mode" AS ENUM('whole', 'by_room');--> statement-breakpoint
CREATE TYPE "public"."profile_role" AS ENUM('owner', 'tenant');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('house', 'flat', 'room');--> statement-breakpoint
CREATE TYPE "public"."tenancy_status" AS ENUM('draft', 'active', 'ended', 'terminated');--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"given_name" text NOT NULL,
	"family_name" text NOT NULL,
	"document_type" "document_type",
	"document_number" text,
	"dob" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid,
	"role" "profile_role" NOT NULL,
	"locale" text DEFAULT 'hu' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"root_property_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" "property_type" NOT NULL,
	"name" text NOT NULL,
	"address_line" text,
	"hrsz" text,
	"letting_mode" "letting_mode",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letting_mode_only_on_flat" CHECK (("properties"."type" = 'flat') = ("properties"."letting_mode" is not null)),
	CONSTRAINT "hrsz_only_on_house_or_flat" CHECK ("properties"."type" <> 'room' or "properties"."hrsz" is null),
	CONSTRAINT "address_only_on_house_or_flat" CHECK ("properties"."type" <> 'room' or "properties"."address_line" is null)
);
--> statement-breakpoint
CREATE TABLE "property_ownership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	CONSTRAINT "property_ownership_property_person_unique" UNIQUE("property_id","person_id"),
	CONSTRAINT "percentage_range" CHECK ("property_ownership"."percentage" > 0 and "property_ownership"."percentage" <= 100)
);
--> statement-breakpoint
CREATE TABLE "tenancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_type" "property_type" NOT NULL,
	"property_id" uuid NOT NULL,
	"primary_tenant_id" uuid NOT NULL,
	"term_start" date NOT NULL,
	"term_end" date,
	"notice_days" integer DEFAULT 30 NOT NULL,
	"due_day" smallint DEFAULT 5 NOT NULL,
	"reminder_lead_days" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "tenancy_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "due_day_range" CHECK ("tenancies"."due_day" between 1 and 28),
	CONSTRAINT "unit_type_not_house" CHECK ("tenancies"."unit_type" in ('flat', 'room'))
);
--> statement-breakpoint
CREATE TABLE "tenancy_occupants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"move_in" date,
	"move_out" date
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"role" "profile_role" NOT NULL,
	"person_id" uuid,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"field_name" text NOT NULL,
	"policy" text DEFAULT 'read_only' NOT NULL,
	"scope" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_root_property_id_properties_id_fk" FOREIGN KEY ("root_property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_parent_id_properties_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_ownership" ADD CONSTRAINT "property_ownership_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_ownership" ADD CONSTRAINT "property_ownership_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_unit_id_properties_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_primary_tenant_id_persons_id_fk" FOREIGN KEY ("primary_tenant_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_occupants" ADD CONSTRAINT "tenancy_occupants_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy_occupants" ADD CONSTRAINT "tenancy_occupants_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_persons_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "properties_parent_id_idx" ON "properties" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "properties_root_property_id_idx" ON "properties" USING btree ("root_property_id");