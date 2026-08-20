"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { logAudit } from "@/server/audit/log";
import { storeAttachment } from "@/lib/attachments/store-attachment";
import { notifyRequestEvent } from "@/server/notifications/notify-request-event";
import { REQUEST_CATEGORIES } from "@/db/schema/requests";

const CreateRequestSchema = z.object({
  // Only meaningful for an owner opening a request on a tenant's behalf
  // (e.g. logging a phone-in repair call) — a tenant caller's own active
  // tenancy is always resolved server-side below, never trusted from
  // input.
  tenancyId: z.string().uuid().nullable().optional(),
  category: z.enum(REQUEST_CATEGORIES),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  externalCaseRef: z.string().trim().min(1).nullable().optional(),
  appointmentDate: z.string().min(1).nullable().optional(),
});

// Both roles can open a request (CLAUDE.md §3.7 describes the tenant path;
// an owner logging one on a tenant's behalf — e.g. a phone-in repair call
// — is the same shape with an explicit tenancyId). RLS (owner_insert_
// requests / tenant_insert_requests, migration 0019) is the actual
// enforcement; this action's job is resolving the right tenancy_id and
// never trusting a tenant-supplied one.
export async function createRequest(input: z.infer<typeof CreateRequestSchema>, file?: File) {
  const parsed = CreateRequestSchema.parse(input);
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  let tenancyId = parsed.tenancyId ?? null;
  if (profile.role === "tenant") {
    const { data: tenancy, error } = await supabase
      .from("tenancies")
      .select("id")
      .eq("primary_tenant_id", profile.personId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tenancy) throw new Error("No active tenancy found");
    tenancyId = tenancy.id;
  }
  if (!tenancyId) throw new Error("tenancyId is required");

  const { data: request, error: insertError } = await supabase
    .from("requests")
    .insert({
      tenancy_id: tenancyId,
      category: parsed.category,
      title: parsed.title,
      description: parsed.description ?? null,
      external_case_ref: parsed.externalCaseRef ?? null,
      appointment_date: parsed.appointmentDate ?? null,
      initiated_by: profile.personId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  if (file) {
    await storeAttachment(
      supabase,
      { entityType: "request", entityId: request.id, uploadedBy: profile.personId },
      file,
    );
  }

  await logAudit(supabase, {
    entityType: "request",
    entityId: request.id,
    actorId: profile.personId,
    action: "create",
    after: { category: parsed.category, title: parsed.title },
  });

  // Owner-opened requests don't need a self-notification.
  if (profile.role === "tenant") {
    await notifyRequestEvent({ requestId: request.id, event: "opened", actorRole: "tenant" });
  }

  return { id: request.id as string };
}
