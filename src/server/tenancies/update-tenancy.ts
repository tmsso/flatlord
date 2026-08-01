"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const UpdateTenancySchema = z.object({
  id: z.string().uuid(),
  primaryTenantRegistrationType: z.enum(["main_address", "temporary", "casual", "owner_agent"]).nullable().optional(),
  termStart: z.string().min(1),
  termEnd: z.string().nullable().optional(),
  noticeDays: z.number().int().positive(),
  dueDay: z.number().int().min(1).max(28),
  status: z.enum(["draft", "active", "ended", "terminated"]),
});

export async function updateTenancy(input: z.infer<typeof UpdateTenancySchema>) {
  const parsed = UpdateTenancySchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: before, error: beforeError } = await supabase
    .from("tenancies")
    .select("primary_tenant_registration_type, term_start, term_end, notice_days, due_day, status")
    .eq("id", parsed.id)
    .single();
  if (beforeError || !before) throw new Error("Tenancy not found");

  const { error } = await supabase
    .from("tenancies")
    .update({
      primary_tenant_registration_type: parsed.primaryTenantRegistrationType ?? null,
      term_start: parsed.termStart,
      term_end: parsed.termEnd ?? null,
      notice_days: parsed.noticeDays,
      due_day: parsed.dueDay,
      status: parsed.status,
    })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "tenancy",
    entityId: parsed.id,
    actorId: personId,
    action: "update",
    before,
    after: {
      primary_tenant_registration_type: parsed.primaryTenantRegistrationType,
      term_start: parsed.termStart,
      term_end: parsed.termEnd,
      notice_days: parsed.noticeDays,
      due_day: parsed.dueDay,
      status: parsed.status,
    },
  });
}
