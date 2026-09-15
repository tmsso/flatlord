import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PersonForm } from "@/components/person-form";
import { getFieldRequirements } from "@/server/persons/get-required-fields";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { AttachmentsSection } from "@/components/attachments-section";

type RegistrationType = "main_address" | "temporary" | "casual" | "owner_agent";
type PropertyRef = { name: string };

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("persons");
  const tRegType = await getTranslations("tenancies");
  const supabase = await createClient();

  const { data: person, error: personError } = await supabase
    .from("persons")
    .select(
      "id, given_name, family_name, document_type, document_number, dob, birth_name, birth_place, mothers_name, citizenship, address_card_number, tax_id, phone, contact_email, registered_address, temporary_address",
    )
    .eq("id", id)
    .maybeSingle();
  assertNoQueryError("persons/[id]", personError);
  if (!person) notFound();

  // Registration type (and the property it's tied to, for the banner)
  // comes from wherever this person is an inhabitant — either as a
  // tenancy's primary tenant or as a tenancy_occupants row. A person can
  // in principle appear in more than one; the first active one found
  // drives the required-field set shown here.
  //
  // Stage 1: primaryTenancies and attachmentRows only need `id` — neither
  // depends on the other, so they run concurrently (BACKLOG.md B-02).
  const [{ data: primaryTenancies }, { data: attachmentRows }] = await Promise.all([
    supabase
      .from("tenancies")
      .select("primary_tenant_registration_type, status, unit_id, properties(name)")
      .eq("primary_tenant_id", id)
      .neq("status", "terminated")
      .limit(1),
    supabase
      .from("attachments")
      .select("id, file_name, size_bytes, note, created_at, storage_path")
      .eq("entity_type", "person")
      .eq("entity_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  let registrationType: RegistrationType | null = null;
  let propertyName: string | null = null;

  if (primaryTenancies?.[0]?.primary_tenant_registration_type) {
    registrationType = primaryTenancies[0].primary_tenant_registration_type as RegistrationType;
    const prop = primaryTenancies[0].properties as unknown as PropertyRef | PropertyRef[] | null;
    propertyName = (Array.isArray(prop) ? prop[0] : prop)?.name ?? null;
  }

  const attachmentPaths = (attachmentRows ?? []).map((a) => a.storage_path).filter((p): p is string => !!p);

  // Stage 2: the occupant fallback (only needed if stage 1 didn't already
  // resolve a registration type) and the attachment signed URLs (depend
  // on stage-1's attachmentRows) — independent of each other.
  const [{ data: occupantRows }, { data: attachmentSignedUrls }] = await Promise.all([
    !registrationType
      ? supabase
          .from("tenancy_occupants")
          .select("registration_type, move_out, tenancies(unit_id, properties(name))")
          .eq("person_id", id)
          .is("move_out", null)
          .limit(1)
      : Promise.resolve({ data: null }),
    attachmentPaths.length ? supabase.storage.from("attachments").createSignedUrls(attachmentPaths, 600) : Promise.resolve({ data: [] }),
  ]);

  if (!registrationType && occupantRows?.[0]?.registration_type) {
    registrationType = occupantRows[0].registration_type as RegistrationType;
    const tenancy = occupantRows[0].tenancies as unknown as
      | { properties: PropertyRef | PropertyRef[] | null }
      | { properties: PropertyRef | PropertyRef[] | null }[]
      | null;
    const ten = Array.isArray(tenancy) ? tenancy[0] : tenancy;
    const prop = ten?.properties;
    propertyName = (Array.isArray(prop) ? prop[0] : prop)?.name ?? null;
  }

  const attachmentUrlByPath = new Map((attachmentSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const requirements = await getFieldRequirements(supabase, registrationType);
  const requirementLabel = registrationType
    ? propertyName
      ? t("requirementBannerAt", { type: tRegType(`registrationType_${registrationType}`), property: propertyName })
      : tRegType(`registrationType_${registrationType}`)
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        {person.given_name} {person.family_name}
      </h1>
      <PersonForm
        mode="edit"
        personId={person.id}
        requirements={requirements}
        requirementLabel={requirementLabel}
        initialValues={{
          givenName: person.given_name,
          familyName: person.family_name,
          documentType: person.document_type,
          documentNumber: person.document_number ?? "",
          dob: person.dob ?? "",
          birthName: person.birth_name ?? "",
          birthPlace: person.birth_place ?? "",
          mothersName: person.mothers_name ?? "",
          citizenship: person.citizenship ?? "",
          addressCardNumber: person.address_card_number ?? "",
          taxId: person.tax_id ?? "",
          phone: person.phone ?? "",
          contactEmail: person.contact_email ?? "",
          registeredAddress: person.registered_address ?? "",
          temporaryAddress: person.temporary_address ?? "",
        }}
      />
      <p className="text-xs text-muted-foreground">{t("auditNote")}</p>
      <AttachmentsSection
        entityType="person"
        entityId={person.id}
        attachments={(attachmentRows ?? []).map((a) => ({
          id: a.id,
          fileName: a.file_name,
          sizeBytes: a.size_bytes,
          note: a.note,
          createdAt: a.created_at,
          downloadUrl: a.storage_path ? (attachmentUrlByPath.get(a.storage_path) ?? null) : null,
        }))}
      />
    </div>
  );
}
