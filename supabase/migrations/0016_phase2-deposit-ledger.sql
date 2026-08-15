CREATE TYPE "public"."deposit_transaction_type" AS ENUM('paid', 'applied', 'retained', 'refunded');--> statement-breakpoint
CREATE TABLE "deposit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"type" "deposit_transaction_type" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) DEFAULT 'HUF' NOT NULL,
	"transaction_date" date NOT NULL,
	"note" text,
	"applied_to_statement_id" uuid,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_transactions_amount_nonnegative" CHECK ("deposit_transactions"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_applied_to_statement_id_statements_id_fk" FOREIGN KEY ("applied_to_statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_recorded_by_persons_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Denormalization: property_id always trigger-set from tenancy_id, same
-- pattern as contracts_set_property_id (migration 0015).
CREATE FUNCTION deposit_transactions_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_deposit_transactions_set_property_id
  BEFORE INSERT OR UPDATE OF tenancy_id ON deposit_transactions
  FOR EACH ROW EXECUTE FUNCTION deposit_transactions_set_property_id();
--> statement-breakpoint

ALTER TABLE deposit_transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Owner: SELECT + INSERT only, scoped by property ownership (same
-- property_ownership/profiles join idiom as owner_scope_contracts,
-- migration 0015). Deliberately no owner_update/owner_delete policy —
-- real financial history is append-only (see the schema file's comment);
-- a correction is a new offsetting transaction, never an edit to a past
-- one, so there's nothing for an UPDATE/DELETE policy to legitimately do.
CREATE POLICY owner_scope_deposit_transactions ON deposit_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = deposit_transactions.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_deposit_transactions ON deposit_transactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = deposit_transactions.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- Tenant: read-only, own tenancy — same tenancies/profiles join idiom as
-- tenant_scope_contracts. No status gate needed here (unlike contracts'
-- draft/active/superseded split): every deposit_transactions row is
-- already a confirmed, recorded event, there's no "unreviewed draft"
-- state to hide from the tenant.
CREATE POLICY tenant_scope_deposit_transactions ON deposit_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = deposit_transactions.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- SELECT + INSERT only — no UPDATE/DELETE grant, matching the RLS
-- policies above (belt-and-suspenders: even a future policy bug can't
-- make a row mutable/deletable if the role was never granted the
-- privilege at all).
GRANT SELECT, INSERT ON deposit_transactions TO authenticated;