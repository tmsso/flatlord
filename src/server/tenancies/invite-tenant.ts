"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { createInvite } from "@/server/auth/create-invite";
import { logAudit } from "@/server/audit/log";

const InviteTenantSchema = z.object({
  tenancyId: z.string().uuid(),
  email: z.string().trim().email(),
});

// Invites a tenancy's primary tenant to the portal, bound to their person
// record. The tenant then signs in at /login with this email (magic link
// or Google); handle_new_user matches the live invite and links the new
// login to the person. Returns { ok:false } for expected failures —
// thrown messages are redacted in production builds.
export async function inviteTenant(input: z.infer<typeof InviteTenantSchema>): Promise<{ ok: true } | { ok: false; error: "invalidEmail" }> {
  const parsed = InviteTenantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalidEmail" };
  const supabase = await createClient();
  const { personId: actorId } = await requireOwnerPersonId(supabase);

  const { data: tenancy, error } = await supabase
    .from("tenancies")
    .select("id, primary_tenant_id")
    .eq("id", parsed.data.tenancyId)
    .single();
  if (error) throw new Error(error.message);

  await createInvite({ email: parsed.data.email, role: "tenant", personId: tenancy.primary_tenant_id });
  await logAudit(supabase, {
    entityType: "tenancy",
    entityId: tenancy.id,
    actorId,
    action: "tenant_invite",
    // the address is contact data the owner already holds; no document data
    after: { personId: tenancy.primary_tenant_id, email: parsed.data.email },
  });
  return { ok: true };
}
