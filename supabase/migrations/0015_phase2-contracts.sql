CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'superseded');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" smallint NOT NULL,
	"predecessor_contract_id" uuid,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"document_path" text,
	"document_text" text,
	"search_vector" "tsvector",
	"term_start" date,
	"term_end" date,
	"notice_days" smallint,
	"deposit_amount" bigint,
	"deposit_currency" char(3) DEFAULT 'HUF' NOT NULL,
	"signed_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_tenancy_version_unique" UNIQUE("tenancy_id","version")
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_predecessor_contract_id_contracts_id_fk" FOREIGN KEY ("predecessor_contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- drizzle-kit has no first-class tsvector type, so the schema file
-- declares search_vector as a plain column (see contracts.ts) purely for
-- diffing purposes — the real column is a generated, indexed full-text
-- column, replacing what generate produced above. 'simple' config
-- (no stemming/stopwords) rather than 'english'/'hungarian' since
-- document_text is genuinely bilingual (contracts here are HU or EN) and
-- neither language-specific config would be correct for the other.
ALTER TABLE "contracts" DROP COLUMN "search_vector";--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("document_text", ''))) STORED;--> statement-breakpoint
CREATE INDEX "contracts_search_vector_idx" ON "contracts" USING gin ("search_vector");--> statement-breakpoint

-- Denormalization: property_id always trigger-set from tenancy_id, same
-- pattern as statements_set_property_id (migration 0008) — never trusted
-- from app input.
CREATE FUNCTION contracts_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_contracts_set_property_id
  BEFORE INSERT OR UPDATE OF tenancy_id ON contracts
  FOR EACH ROW EXECUTE FUNCTION contracts_set_property_id();
--> statement-breakpoint

-- Version-chain invariant: at most one 'active' contract per tenancy —
-- activateContract() (src/server/contracts/activate-contract.ts) flips the
-- prior active version to 'superseded' in the same request before setting
-- the new one 'active', but this index is what actually guarantees it
-- can't be violated by a race or a future bypass of that server action.
CREATE UNIQUE INDEX "contracts_one_active_per_tenancy" ON "contracts" ("tenancy_id")
  WHERE "status" = 'active';
--> statement-breakpoint

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Owner: full CRUD scoped by property ownership, same
-- property_ownership/profiles join idiom as owner_scope_statements (0008).
CREATE POLICY owner_scope_contracts ON contracts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = contracts.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_contracts ON contracts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = contracts.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_contracts ON contracts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = contracts.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- Tenant: read-only, and only status IN ('active','superseded') — a
-- 'draft' contract is pre-review (structured terms unconfirmed, "nothing
-- auto-committed" per ROADMAP Phase 2), so it must never be tenant-visible.
CREATE POLICY tenant_scope_contracts ON contracts
  FOR SELECT USING (
    contracts.status IN ('active', 'superseded')
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = contracts.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON contracts TO authenticated;
--> statement-breakpoint

-- contracts Storage bucket + RLS, same shape as meter-photos (migration
-- 0010) — private bucket, path convention {tenancyId}/{contractId}.pdf,
-- keyed off the tenancyId path segment via storage.foldername() since
-- storage.objects has no FK to contracts to join through directly.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contracts', 'contracts', false, 26214400, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

CREATE POLICY owner_insert_contract_documents ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = ((storage.foldername(name))[1])::uuid
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_select_contract_documents ON storage.objects
  FOR SELECT USING (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = ((storage.foldername(name))[1])::uuid
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- Tenant: read only the document behind a contract row they can already
-- see via tenant_scope_contracts (active/superseded) — re-checks status
-- here too since storage.objects can't join contracts directly (no FK,
-- only the tenancyId path segment), so it can't rely on the table policy
-- alone to hide draft-version PDFs.
CREATE POLICY tenant_select_contract_documents ON storage.objects
  FOR SELECT USING (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = ((storage.foldername(name))[1])::uuid
        AND pr.id = auth.uid() AND pr.role = 'tenant'
        AND EXISTS (
          SELECT 1 FROM contracts c
          WHERE c.tenancy_id = t.id
            AND c.status IN ('active', 'superseded')
            AND c.document_path = name
        )
    )
  );