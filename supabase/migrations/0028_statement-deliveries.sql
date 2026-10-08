CREATE TABLE "statement_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"tenancy_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statement_deliveries_channel_check" CHECK ("statement_deliveries"."channel" in ('email', 'whatsapp')),
	CONSTRAINT "statement_deliveries_kind_check" CHECK ("statement_deliveries"."kind" in ('amount_due', 'payment_reminder')),
	CONSTRAINT "statement_deliveries_status_check" CHECK ("statement_deliveries"."status" in ('sent', 'failed', 'prepared'))
);
--> statement-breakpoint
ALTER TABLE "statement_deliveries" ADD CONSTRAINT "statement_deliveries_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_deliveries" ADD CONSTRAINT "statement_deliveries_created_by_persons_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "statement_deliveries_statement_id_idx" ON "statement_deliveries" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "statement_deliveries_created_by_idx" ON "statement_deliveries" USING btree ("created_by");--> statement-breakpoint

-- Scope denormalized from the parent statement, same as payments_set_scope.
CREATE FUNCTION statement_deliveries_set_scope() RETURNS trigger AS $$
BEGIN
  SELECT tenancy_id, property_id INTO NEW.tenancy_id, NEW.property_id
  FROM statements WHERE id = NEW.statement_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_statement_deliveries_set_scope
  BEFORE INSERT OR UPDATE OF statement_id ON statement_deliveries
  FOR EACH ROW EXECUTE FUNCTION statement_deliveries_set_scope();
--> statement-breakpoint

-- Owner-only, append-only: SELECT + INSERT for owners of the property; no
-- tenant policy (the log is an admin view), no UPDATE/DELETE policy (RLS
-- default-deny — the explicit GRANT below omits them too, but on the cloud
-- projects a default ACL grants them anyway, so the missing policy is what
-- actually enforces it). The cron writes with the service-role client.
ALTER TABLE statement_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY owner_scope_statement_deliveries ON statement_deliveries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = statement_deliveries.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_statement_deliveries ON statement_deliveries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = statement_deliveries.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- Explicit, not inherited: CI's fresh stack has no default ACL (memory:
-- authenticated-role grants), so a missing GRANT would pass on dev and
-- fail everywhere else.
GRANT SELECT, INSERT ON statement_deliveries TO authenticated;
