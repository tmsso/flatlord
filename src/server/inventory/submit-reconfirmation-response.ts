"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { logAudit } from "@/server/audit/log";
import { storeAttachment } from "@/lib/attachments/store-attachment";
import { sendInventoryDiscrepancyEmail } from "@/server/notifications/send-inventory-discrepancy-email";
import { notifyRequestEvent } from "@/server/notifications/notify-request-event";
import { getTranslations } from "next-intl/server";

const SubmitReconfirmationResponseSchema = z.object({
  reconfirmationItemId: z.string().uuid(),
  status: z.enum(["confirmed", "discrepancy"]),
  tenantNote: z.string().trim().min(1).nullable().optional(),
});

// Tenant-facing reconfirmation response (CLAUDE.md §3.9): item-by-item
// confirm/flag-discrepancy with an optional note and photo. Same auth
// pattern as submit-meter-reading.ts (resolve role/person_id server-side,
// never trust client input) rather than requireOwnerPersonId — this is
// the one tenant-write path in this batch.
export async function submitReconfirmationResponse(
  input: z.infer<typeof SubmitReconfirmationResponseSchema>,
  photo?: File,
) {
  const parsed = SubmitReconfirmationResponseSchema.parse(input);
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (profile.role !== "tenant") throw new Error("Not authorized");

  // Ownership re-check beyond RLS (CLAUDE.md §6: "RLS is the last line of
  // defence, not the only one") — also the query that resolves the item
  // title/property for the discrepancy email and the attachment's
  // entity_id. Comes back null (via tenant_scope_inventory_reconfirmation_
  // items RLS) if this row isn't actually the caller's own.
  const { data: reconfirmationItem, error: fetchError } = await supabase
    .from("inventory_reconfirmation_items")
    .select(
      "id, inventory_item_id, inventory_items(title, property_id), inventory_reconfirmations(tenancy_id)",
    )
    .eq("id", parsed.reconfirmationItemId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!reconfirmationItem) throw new Error("Not found");

  type ItemRef = { title: string; property_id: string };
  const itemRef = reconfirmationItem.inventory_items as unknown as ItemRef | ItemRef[] | null;
  const item = Array.isArray(itemRef) ? itemRef[0] : itemRef;
  if (!item) throw new Error("Not found");

  type ReconfirmationRef = { tenancy_id: string };
  const reconfirmationRef = reconfirmationItem.inventory_reconfirmations as unknown as
    | ReconfirmationRef
    | ReconfirmationRef[]
    | null;
  const reconfirmation = Array.isArray(reconfirmationRef) ? reconfirmationRef[0] : reconfirmationRef;
  if (!reconfirmation) throw new Error("Not found");

  if (photo) {
    await storeAttachment(
      supabase,
      {
        entityType: "inventory_item",
        entityId: reconfirmationItem.inventory_item_id,
        note: `Reconfirmation photo — ${new Date().toISOString().slice(0, 10)}`,
        uploadedBy: profile.personId,
      },
      photo,
    );
  }

  const { error: updateError } = await supabase
    .from("inventory_reconfirmation_items")
    .update({
      status: parsed.status,
      tenant_note: parsed.tenantNote ?? null,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", parsed.reconfirmationItemId);
  if (updateError) throw new Error(updateError.message);

  await logAudit(supabase, {
    entityType: "inventory_reconfirmation_item",
    entityId: parsed.reconfirmationItemId,
    actorId: profile.personId,
    action: "update",
    after: { status: parsed.status },
  });

  // Real "discrepancies open requests automatically" (CLAUDE.md §3.9),
  // wired up now that the Requests module exists (ROADMAP Phase 2's
  // handoff note to Phase 3) — the owner-notification email above stays
  // as a fast heads-up, this creates the actual trackable request in the
  // same admin dashboard/queue every other request lands in.
  if (parsed.status === "discrepancy") {
    const t = await getTranslations("requests");
    const { data: request, error: requestError } = await supabase
      .from("requests")
      .insert({
        tenancy_id: reconfirmation.tenancy_id,
        category: "inventory",
        title: item.title,
        description: [t("inventoryDiscrepancyPrefix", { item: item.title }), parsed.tenantNote].filter(Boolean).join(" "),
        initiated_by: profile.personId,
      })
      .select("id")
      .single();
    if (requestError) {
      console.error("submitReconfirmationResponse: auto-open request failed", requestError.message);
    } else {
      await logAudit(supabase, {
        entityType: "request",
        entityId: request.id,
        actorId: profile.personId,
        action: "create",
        after: { category: "inventory", title: item.title },
      });
      await notifyRequestEvent({ requestId: request.id, event: "opened", actorRole: "tenant" });
    }

    await sendInventoryDiscrepancyEmail({
      propertyId: item.property_id,
      itemTitle: item.title,
      tenantNote: parsed.tenantNote ?? null,
    });
  }
}
