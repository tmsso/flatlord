-- B-35 facilities register (owner request 2026-10-11). Facilities — built-in
-- parts of the flat such as central heating, the gas connection, a cooker,
-- AC — live in inventory_items as kind = 'facility', so they reuse photos/
-- attachments, RLS (tenant read-only, owner CRUD) and the repair picker
-- (B-36). A facility is always owner-owned: the CHECK makes that hold for
-- any writer, not just the app. Existing rows default to 'item'. Additive:
-- old code ignores the column; table-level GRANTs already cover it.
ALTER TABLE "inventory_items" ADD COLUMN "kind" text DEFAULT 'item' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_kind_check" CHECK ("inventory_items"."kind" in ('item', 'facility'));--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_facility_owner_owned" CHECK ("inventory_items"."kind" <> 'facility' or "inventory_items"."owned_by" = 'owner');