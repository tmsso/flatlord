import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { HandoverDocument } from "@/lib/documents/handover-template";
import type { SnapshotInventoryItem, SnapshotMeter } from "@/lib/handover/build-snapshot";

// B-13: renders a handover snapshot as a bilingual PDF. The caller's RLS
// decides visibility (owner → own property, tenant → own tenancy, D-49);
// returns null when the snapshot isn't visible.
export async function renderHandoverPdf(supabase: SupabaseClient, snapshotId: string): Promise<{ bytes: ArrayBuffer; fileName: string } | null> {
  const { data: s, error } = await supabase
    .from("handover_snapshots")
    .select("id, kind, taken_at, note, inventory, meters, tenancies(unit_id, persons(given_name, family_name), properties(name))")
    .eq("id", snapshotId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!s) return null;
  const t = (Array.isArray(s.tenancies) ? s.tenancies[0] : s.tenancies) as {
    persons: { given_name: string; family_name: string } | { given_name: string; family_name: string }[] | null;
    properties: { name: string } | { name: string }[] | null;
  } | null;
  const person = t && (Array.isArray(t.persons) ? t.persons[0] : t.persons);
  const property = t && (Array.isArray(t.properties) ? t.properties[0] : t.properties);
  const takenAt = new Intl.DateTimeFormat("hu-HU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Budapest" }).format(new Date(s.taken_at));

  const buffer = await renderToBuffer(
    HandoverDocument({
      data: {
        kind: s.kind as "move_in" | "move_out",
        takenAt,
        propertyName: property?.name ?? "—",
        tenantName: person ? `${person.given_name} ${person.family_name}` : "—",
        note: s.note,
        meters: s.meters as SnapshotMeter[],
        inventory: s.inventory as SnapshotInventoryItem[],
      },
    }),
  );
  const out = new Uint8Array(buffer.length);
  out.set(buffer);
  return { bytes: out.buffer, fileName: `handover-${s.kind.replace("_", "-")}-${s.taken_at.slice(0, 10)}.pdf` };
}
