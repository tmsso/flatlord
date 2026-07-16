-- trg_properties_letting_exclusivity only watched (active, letting_mode),
-- so `UPDATE properties SET parent_id = <whole_flat_id> WHERE id =
-- <active_room>` re-parented an active room under a whole-mode flat
-- without ever re-checking the invariant — room-parent-is-flat only
-- validates the parent IS a flat, not that the flat's letting_mode allows
-- an active room. Re-create the trigger watching parent_id (and type, for
-- symmetry with trg_properties_room_parent_is_flat) too; the function body
-- already re-derives everything from NEW on every firing, so no function
-- change is needed — only which column changes wake it up.

DROP TRIGGER trg_properties_letting_exclusivity ON properties;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER trg_properties_letting_exclusivity
  AFTER INSERT OR UPDATE OF active, letting_mode, parent_id, type ON properties
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION properties_check_letting_exclusivity();
