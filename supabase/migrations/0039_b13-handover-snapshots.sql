CREATE TABLE "handover_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taken_by" uuid NOT NULL,
	"note" text,
	"inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handover_snapshots_kind_check" CHECK ("handover_snapshots"."kind" in ('move_in', 'move_out'))
);
--> statement-breakpoint
ALTER TABLE "handover_snapshots" ADD CONSTRAINT "handover_snapshots_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_snapshots" ADD CONSTRAINT "handover_snapshots_taken_by_persons_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handover_snapshots_tenancy_id_idx" ON "handover_snapshots" USING btree ("tenancy_id");--> statement-breakpoint
CREATE INDEX "handover_snapshots_taken_by_idx" ON "handover_snapshots" USING btree ("taken_by");--> statement-breakpoint
-- property_id = the tenancy's property (owner RLS scope), same as
-- inventory_reconfirmations (0018).
CREATE FUNCTION handover_snapshots_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_handover_snapshots_set_property_id
  BEFORE INSERT ON handover_snapshots
  FOR EACH ROW EXECUTE FUNCTION handover_snapshots_set_property_id();
--> statement-breakpoint
ALTER TABLE handover_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_scope_handover_snapshots ON handover_snapshots
  FOR SELECT USING (private.owner_person_id() IS NOT NULL AND property_owned_by(handover_snapshots.property_id, auth.uid()));
--> statement-breakpoint
-- An owner records snapshots only on their own tenancies, only as themselves.
CREATE POLICY owner_insert_handover_snapshots ON handover_snapshots
  FOR INSERT WITH CHECK (
    private.owner_person_id() IS NOT NULL
    AND handover_snapshots.taken_by = private.owner_person_id()
    AND EXISTS (
      SELECT 1 FROM tenancies t
      WHERE t.id = handover_snapshots.tenancy_id AND property_owned_by(t.property_id, auth.uid())
    )
  );
--> statement-breakpoint
-- The tenant reads their own tenancy's handover record (D-49).
CREATE POLICY tenant_scope_handover_snapshots ON handover_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = handover_snapshots.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint
-- No UPDATE / DELETE policy: a snapshot is immutable once taken.
GRANT SELECT, INSERT ON handover_snapshots TO authenticated;
