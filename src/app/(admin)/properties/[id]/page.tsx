import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PropertyDetail } from "@/components/property-detail";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { InventorySection } from "@/components/inventory-section";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("properties");
  const supabase = await createClient();

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, parent_id, root_property_id, type, name, address_line, hrsz, payment_instructions, letting_mode, active")
    .eq("id", id)
    .maybeSingle();
  assertNoQueryError("properties/[id]", propertyError);
  if (!property) notFound();

  const isRoot = property.parent_id === null;

  const { data: ownershipRows } = isRoot
    ? await supabase
        .from("property_ownership")
        .select("id, person_id, percentage, persons(given_name, family_name)")
        .eq("property_id", property.root_property_id)
    : { data: [] };

  const { data: personRows } = await supabase.from("persons").select("id, given_name, family_name").order("family_name");

  const { data: childRows } = await supabase
    .from("properties")
    .select("id, name, type, hrsz, active")
    .eq("parent_id", id)
    .order("name");

  // Inhabitants of this specific unit: tenancies against it, plus their
  // occupants — property_id (denormalized root) isn't the right scope
  // here, unit_id (the actual lettable node) is.
  const { data: tenanciesForUnit } = await supabase
    .from("tenancies")
    .select("id, primary_tenant_id, primary_tenant_registration_type, status, persons(id, given_name, family_name)")
    .eq("unit_id", id)
    .neq("status", "terminated");

  const tenancyIds = (tenanciesForUnit ?? []).map((t) => t.id);
  const { data: occupantRows } = tenancyIds.length
    ? await supabase
        .from("tenancy_occupants")
        .select("id, tenancy_id, relationship, registration_type, move_out, persons(id, given_name, family_name)")
        .in("tenancy_id", tenancyIds)
        .is("move_out", null)
    : { data: [] };

  type PersonRef = { id: string; given_name: string; family_name: string };
  const inhabitants: { personId: string; name: string; registrationType: string | null; relationship: string }[] = [];
  for (const ten of tenanciesForUnit ?? []) {
    const person = ten.persons as unknown as PersonRef | PersonRef[] | null;
    const p = Array.isArray(person) ? person[0] : person;
    if (p) {
      inhabitants.push({
        personId: p.id,
        name: `${p.given_name} ${p.family_name}`,
        registrationType: ten.primary_tenant_registration_type,
        relationship: "primary",
      });
    }
  }
  for (const occ of occupantRows ?? []) {
    const person = occ.persons as unknown as PersonRef | PersonRef[] | null;
    const p = Array.isArray(person) ? person[0] : person;
    if (p) {
      inhabitants.push({
        personId: p.id,
        name: `${p.given_name} ${p.family_name}`,
        registrationType: occ.registration_type,
        relationship: occ.relationship,
      });
    }
  }

  const { data: inventoryRows } = await supabase
    .from("inventory_items")
    .select("id, title, description, owned_by, condition, notes, action_by_date, action_by_reason, status")
    .eq("unit_id", id)
    .order("created_at", { ascending: false });

  const inventoryIds = (inventoryRows ?? []).map((i) => i.id);
  const { data: inventoryAttachmentRows } = inventoryIds.length
    ? await supabase
        .from("attachments")
        .select("id, entity_id, file_name, size_bytes, note, created_at, storage_path")
        .eq("entity_type", "inventory_item")
        .in("entity_id", inventoryIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };
  const inventoryAttachmentPaths = (inventoryAttachmentRows ?? []).map((a) => a.storage_path).filter((p): p is string => !!p);
  const { data: inventoryAttachmentSignedUrls } = inventoryAttachmentPaths.length
    ? await supabase.storage.from("attachments").createSignedUrls(inventoryAttachmentPaths, 600)
    : { data: [] };
  const inventoryAttachmentUrlByPath = new Map((inventoryAttachmentSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const activeTenancyId = tenanciesForUnit?.[0]?.id ?? null;
  const { data: campaignRows } = activeTenancyId
    ? await supabase
        .from("inventory_reconfirmations")
        .select("id, scope, status, initiated_at, due_date, note")
        .eq("tenancy_id", activeTenancyId)
        .order("initiated_at", { ascending: false })
    : { data: [] };
  const campaignIds = (campaignRows ?? []).map((c) => c.id);
  const { data: campaignItemRows } = campaignIds.length
    ? await supabase
        .from("inventory_reconfirmation_items")
        .select("id, reconfirmation_id, status, tenant_note, inventory_items(title)")
        .in("reconfirmation_id", campaignIds)
    : { data: [] };

  type InventoryItemTitleRef = { title: string };
  const campaignsWithItems = (campaignRows ?? []).map((c) => ({
    id: c.id,
    scope: c.scope as "full" | "subset",
    status: c.status as "open" | "completed",
    initiatedAt: c.initiated_at,
    dueDate: c.due_date,
    note: c.note,
    items: (campaignItemRows ?? [])
      .filter((ci) => ci.reconfirmation_id === c.id)
      .map((ci) => {
        const ref = ci.inventory_items as unknown as InventoryItemTitleRef | InventoryItemTitleRef[] | null;
        const invItem = Array.isArray(ref) ? ref[0] : ref;
        return {
          id: ci.id,
          itemTitle: invItem?.title ?? "—",
          status: ci.status as "pending" | "confirmed" | "discrepancy",
          tenantNote: ci.tenant_note,
        };
      }),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-muted-foreground">{t("title")}</div>
      <PropertyDetail
        property={{
          id: property.id,
          type: property.type,
          name: property.name,
          addressLine: property.address_line,
          hrsz: property.hrsz,
          paymentInstructions: property.payment_instructions,
          lettingMode: property.letting_mode,
          active: property.active,
          isRoot,
        }}
        childProperties={(childRows ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type, hrsz: c.hrsz, active: c.active }))}
        owners={(ownershipRows ?? []).map((o) => {
          const person = o.persons as unknown as PersonRef | PersonRef[] | null;
          const p = Array.isArray(person) ? person[0] : person;
          return { id: o.id, personName: p ? `${p.given_name} ${p.family_name}` : "—", percentage: Number(o.percentage) };
        })}
        inhabitants={inhabitants}
        tenancyId={tenanciesForUnit?.[0]?.id ?? null}
        persons={(personRows ?? []).map((p) => ({ id: p.id, name: `${p.given_name} ${p.family_name}` }))}
      />
      <InventorySection
        unitId={property.id}
        tenancyId={activeTenancyId}
        items={(inventoryRows ?? []).map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          ownedBy: i.owned_by as "owner" | "renter" | "conditional",
          condition: i.condition,
          notes: i.notes,
          actionByDate: i.action_by_date,
          actionByReason: i.action_by_reason,
          status: i.status as "active" | "removed" | "transferred",
          attachments: (inventoryAttachmentRows ?? [])
            .filter((a) => a.entity_id === i.id)
            .map((a) => ({
              id: a.id,
              fileName: a.file_name,
              sizeBytes: a.size_bytes,
              note: a.note,
              createdAt: a.created_at,
              downloadUrl: a.storage_path ? (inventoryAttachmentUrlByPath.get(a.storage_path) ?? null) : null,
            })),
        }))}
        campaigns={campaignsWithItems}
      />
    </div>
  );
}
