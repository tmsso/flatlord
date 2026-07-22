-- meter-photos Storage bucket + RLS (ROADMAP Phase 1: tenant photo
-- capture for meter readings). Private bucket, path convention
-- {tenancyId}/{meterId}/{uuid}.{ext} — the tenancyId segment is what
-- storage.foldername(name) is joined against below, since storage.objects
-- has no FK to meter_readings/tenancies to join through directly. Photos
-- upload before any meter_readings row exists (submission happens at the
-- end of the tenant's review step), so the path can't be reading-based.
--
-- storage.objects already has RLS enabled by Supabase itself and is owned
-- by supabase_storage_admin — only CREATE POLICY here, no ALTER TABLE.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('meter-photos', 'meter-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- Tenant may insert/select objects only under their own *active*
-- tenancy's folder — mirrors tenant_insert_meter_readings/
-- tenant_scope_meter_readings from 0008, joined via foldername() instead
-- of a tenancy_id column.
CREATE POLICY tenant_insert_meter_photos ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meter-photos'
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = ((storage.foldername(name))[1])::uuid
        AND t.status = 'active'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_select_meter_photos ON storage.objects
  FOR SELECT USING (
    bucket_id = 'meter-photos'
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = ((storage.foldername(name))[1])::uuid
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- Owner: read any photo under a tenancy on a property they own — same
-- property_ownership join idiom as owner_scope_meter_readings, routed
-- through tenancies since storage.objects only carries the tenancyId
-- path segment to key off.
CREATE POLICY owner_select_meter_photos ON storage.objects
  FOR SELECT USING (
    bucket_id = 'meter-photos'
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = ((storage.foldername(name))[1])::uuid
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );

-- No UPDATE/DELETE policy for either role, mirroring meter_readings (no
-- DELETE grant there either) — retakes upload a new object under a new
-- uuid rather than overwriting. Orphaned objects from abandoned/retaken
-- photos are an accepted v1 gap (private bucket, no PII exposure);
-- cleanup is a stated follow-up.