"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { buildSnapshotInventory, buildSnapshotMeters } from "@/lib/handover/build-snapshot";

const TakeSnapshotSchema = z.object({
  tenancyId: z.string().uuid(),
  kind: z.enum(["move_in", "move_out"]),
  note: z.string().trim().max(4000).optional(),
});

// B-13: freezes the unit's inventory + meter baselines into an immutable
// handover_snapshots row (owner only; RLS enforces ownership and actor).
export async function takeHandoverSnapshot(input: z.input<typeof TakeSnapshotSchema>): Promise<{ ok: true; snapshotId: string }> {
  const parsed = TakeSnapshotSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: tenancy, error: tenancyError } = await supabase.from("tenancies").select("id, unit_id").eq("id", parsed.tenancyId).single();
  if (tenancyError) throw new Error(tenancyError.message);

  const [itemsRes, metersRes] = await Promise.all([
    supabase.from("inventory_items").select("id, title, kind, owned_by, condition, status, notes").eq("unit_id", tenancy.unit_id).order("title"),
    supabase.from("meters").select("id, label, base_value, installed_at, removed_at, charge_types(unit)").eq("unit_id", tenancy.unit_id).order("label"),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (metersRes.error) throw new Error(metersRes.error.message);
  const items = itemsRes.data ?? [];
  const meters = metersRes.data ?? [];

  const [attachmentsRes, readingsRes] = await Promise.all([
    items.length
      ? supabase.from("attachments").select("entity_id, storage_path").eq("entity_type", "inventory_item").in("entity_id", items.map((i) => i.id)).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    meters.length
      ? supabase.from("meter_readings").select("meter_id, reading_date, confirmed_value, created_at").in("meter_id", meters.map((m) => m.id)).eq("status", "verified")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (attachmentsRes.error) throw new Error(attachmentsRes.error.message);
  if (readingsRes.error) throw new Error(readingsRes.error.message);

  const today = new Date().toISOString().slice(0, 10);
  const { data: row, error } = await supabase
    .from("handover_snapshots")
    .insert({
      tenancy_id: tenancy.id,
      kind: parsed.kind,
      taken_by: personId,
      note: parsed.note || null,
      inventory: buildSnapshotInventory(items, attachmentsRes.data ?? []),
      meters: buildSnapshotMeters(
        meters.map((m) => {
          const ct = Array.isArray(m.charge_types) ? m.charge_types[0] : m.charge_types;
          return { ...m, unit: (ct as { unit: string | null } | null)?.unit ?? null };
        }),
        readingsRes.data ?? [],
        today,
      ),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/tenancies/${tenancy.id}`);
  return { ok: true, snapshotId: row.id };
}
