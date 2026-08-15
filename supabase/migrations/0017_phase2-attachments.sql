CREATE TYPE "public"."attachment_entity_type" AS ENUM('tenancy', 'person');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "attachment_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"property_id" uuid,
	"storage_path" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"note" text,
	"uploaded_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_persons_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Denormalization: property_id trigger-set from tenancies.property_id,
-- same pattern as contracts_set_property_id (migration 0015) — but only
-- for entity_type = 'tenancy'. entity_type = 'person' has no single
-- property to denormalize to (a person isn't property-scoped; see
-- owner_scope_persons, migration 0001), so property_id stays null there
-- and RLS for that branch checks role only, not property ownership.
CREATE FUNCTION attachments_set_property_id() RETURNS trigger AS $$
BEGIN
  IF NEW.entity_type = 'tenancy' THEN
    SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.entity_id;
  ELSE
    NEW.property_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_attachments_set_property_id
  BEFORE INSERT OR UPDATE OF entity_type, entity_id ON attachments
  FOR EACH ROW EXECUTE FUNCTION attachments_set_property_id();
--> statement-breakpoint

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Owner: full CRUD (insert + soft-delete via update), branched by
-- entity_type — 'person' mirrors owner_scope_persons (any owner manages
-- every person record, no property join); 'tenancy' mirrors
-- owner_scope_tenancies (property_ownership join). One policy per command
-- with an OR between the two branches, rather than four separate
-- policies, to keep it close to how a single-entity-type table like
-- contracts reads while still covering both types here.
CREATE POLICY owner_scope_attachments ON attachments
  FOR SELECT USING (
    (
      attachments.entity_type = 'person'
      AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
    )
    OR (
      attachments.entity_type = 'tenancy'
      AND EXISTS (
        SELECT 1 FROM tenancies t
        JOIN property_ownership po ON po.property_id = t.property_id
        JOIN profiles pr ON pr.person_id = po.person_id
        WHERE t.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
      )
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_attachments ON attachments
  FOR INSERT WITH CHECK (
    (
      entity_type = 'person'
      AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
    )
    OR (
      entity_type = 'tenancy'
      AND EXISTS (
        SELECT 1 FROM tenancies t
        JOIN property_ownership po ON po.property_id = t.property_id
        JOIN profiles pr ON pr.person_id = po.person_id
        WHERE t.id = entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
      )
    )
  );
--> statement-breakpoint

-- Owner UPDATE exists only for soft-delete (setting deleted_at) — the app
-- never edits an uploaded file's bytes/metadata, just marks it removed.
CREATE POLICY owner_update_attachments ON attachments
  FOR UPDATE USING (
    (
      attachments.entity_type = 'person'
      AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
    )
    OR (
      attachments.entity_type = 'tenancy'
      AND EXISTS (
        SELECT 1 FROM tenancies t
        JOIN property_ownership po ON po.property_id = t.property_id
        JOIN profiles pr ON pr.person_id = po.person_id
        WHERE t.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
      )
    )
  );
--> statement-breakpoint

-- Tenant: read-only, own tenancy's attachments + own person record's
-- attachments, soft-deleted rows excluded (a removed attachment shouldn't
-- reappear in the tenant's view even though the owner can still see it for
-- history). No tenant INSERT/UPDATE policy — upload is admin-only in this
-- PR (ROADMAP Phase 2 item 4 scope decision).
CREATE POLICY tenant_scope_attachments ON attachments
  FOR SELECT USING (
    attachments.deleted_at IS NULL
    AND (
      (
        attachments.entity_type = 'person'
        AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'tenant' AND pr.person_id = attachments.entity_id)
      )
      OR (
        attachments.entity_type = 'tenancy'
        AND EXISTS (
          SELECT 1 FROM tenancies t
          JOIN profiles pr ON pr.person_id = t.primary_tenant_id
          WHERE t.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'tenant'
        )
      )
    )
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON attachments TO authenticated;
--> statement-breakpoint

-- attachments Storage bucket + RLS, same shape as contracts (migration
-- 0015) but keyed by two path segments ({entityType}/{entityId}/...) since
-- this bucket is polymorphic — storage.objects has no FK to attachments to
-- join through, same reasoning as contracts' tenancyId-keyed policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments', 'attachments', false, 26214400,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

CREATE POLICY owner_insert_attachment_objects ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'attachments'
    AND (
      (
        (storage.foldername(name))[1] = 'person'
        AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
      )
      OR (
        (storage.foldername(name))[1] = 'tenancy'
        AND EXISTS (
          SELECT 1 FROM tenancies t
          JOIN property_ownership po ON po.property_id = t.property_id
          JOIN profiles pr ON pr.person_id = po.person_id
          WHERE t.id = ((storage.foldername(name))[2])::uuid AND pr.id = auth.uid() AND pr.role = 'owner'
        )
      )
    )
  );
--> statement-breakpoint

CREATE POLICY owner_select_attachment_objects ON storage.objects
  FOR SELECT USING (
    bucket_id = 'attachments'
    AND (
      (
        (storage.foldername(name))[1] = 'person'
        AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
      )
      OR (
        (storage.foldername(name))[1] = 'tenancy'
        AND EXISTS (
          SELECT 1 FROM tenancies t
          JOIN property_ownership po ON po.property_id = t.property_id
          JOIN profiles pr ON pr.person_id = po.person_id
          WHERE t.id = ((storage.foldername(name))[2])::uuid AND pr.id = auth.uid() AND pr.role = 'owner'
        )
      )
    )
  );
--> statement-breakpoint

-- Tenant: read only an object behind an attachments row they can already
-- see via tenant_scope_attachments — re-checked here too since
-- storage.objects can't join attachments directly (no FK, only path
-- segments), so a soft-deleted or foreign attachment's file can't be
-- fetched by guessing/keeping its old signed-URL path.
CREATE POLICY tenant_select_attachment_objects ON storage.objects
  FOR SELECT USING (
    bucket_id = 'attachments'
    AND (
      (
        (storage.foldername(name))[1] = 'person'
        AND EXISTS (
          SELECT 1 FROM profiles pr
          WHERE pr.id = auth.uid() AND pr.role = 'tenant' AND pr.person_id = ((storage.foldername(name))[2])::uuid
        )
      )
      OR (
        (storage.foldername(name))[1] = 'tenancy'
        AND EXISTS (
          SELECT 1 FROM tenancies t
          JOIN profiles pr ON pr.person_id = t.primary_tenant_id
          WHERE t.id = ((storage.foldername(name))[2])::uuid AND pr.id = auth.uid() AND pr.role = 'tenant'
        )
      )
    )
    AND EXISTS (
      SELECT 1 FROM attachments a
      WHERE a.storage_path = name AND a.deleted_at IS NULL
    )
  );