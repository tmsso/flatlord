-- Invite creation/revocation happen through the caller's own (owner)
-- session, not the service-role client — the actor at that moment is the
-- admin, who already has a real session; RLS is the right mechanism here,
-- not a bypass.
CREATE POLICY owner_insert_invites ON invites
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

CREATE POLICY owner_update_invites ON invites
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
