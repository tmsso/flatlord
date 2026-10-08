"use server";

import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";

const CreateInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "tenant"]),
  personId: z.string().uuid().optional(),
  expiresInDays: z.number().int().positive().default(7),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Returns the raw one-time token exactly once — only its hash is stored.
// Share it with the invitee out of band (email/WhatsApp); there is no
// separate invite-acceptance page in Phase 0 — the invitee just signs in
// with the invited email via Google OAuth or magic link, and
// handle_new_user() matches the live invite by email.
export async function createInvite(input: {
  email: string;
  role: "owner" | "tenant";
  personId?: string;
  expiresInDays?: number;
}) {
  const parsed = CreateInviteSchema.parse(input);
  const supabase = await createClient();

  // Owner-only; resolves invites.invited_by (a persons.id, not an auth
  // user id). RLS (owner_insert_invites) remains the real enforcement.
  const { personId } = await requireOwnerPersonId(supabase);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + parsed.expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // RLS (owner_insert_invites) enforces that only an owner can reach this
  // insert — no service-role bypass needed, the caller already has a
  // session.
  const { error } = await supabase.from("invites").insert({
    email: parsed.email,
    token_hash: hashToken(token),
    role: parsed.role,
    person_id: parsed.personId ?? null,
    invited_by: personId,
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message);

  return { token };
}
