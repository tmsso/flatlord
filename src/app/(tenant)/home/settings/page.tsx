import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { maskId } from "@/lib/format/mask-id";
import { getFieldPolicyMap, resolveFieldPolicy } from "@/server/field-editability/get-field-policy-map";
import { PERSON_EDITABLE_FIELDS, PERSON_SENSITIVE_FIELD_KEYS } from "@/lib/field-editability/person-fields";
import { EditablePersonField } from "@/components/field-editability/editable-person-field";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type PropertyRef = { name: string; address_line: string | null };

const SELF_SELECT_COLUMNS = ["given_name", "family_name", "document_type", ...PERSON_EDITABLE_FIELDS.map((f) => f.key)]
  .filter((v, i, arr) => arr.indexOf(v) === i)
  .join(", ");

export default async function TenantProfilePage() {
  const t = await getTranslations("tenantProfile");
  const tRegType = await getTranslations("tenancies");
  const tPerson = await getTranslations("persons");
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select(
      "id, term_start, term_end, notice_days, due_day, primary_tenant_registration_type, properties(name, address_line)",
    )
    .eq("primary_tenant_id", profile.personId)
    .eq("status", "active")
    .maybeSingle();

  const { data: self } = await supabase.from("persons").select(SELF_SELECT_COLUMNS).eq("id", profile.personId).maybeSingle();
  const selfRow = self as unknown as Record<string, string | null> | null;

  const { data: occupantRows } = tenancy
    ? await supabase
        .from("tenancy_occupants")
        .select("id, relationship, registration_type, move_in, move_out, persons(given_name, family_name, document_type, document_number, dob)")
        .eq("tenancy_id", tenancy.id)
        .is("move_out", null)
    : { data: [] };

  const policyMap = await getFieldPolicyMap(supabase, "person");

  // One open approval_required request per field at a time (enforced in
  // submit-field-edit.ts) — fetch them all up front so each field row can
  // show its own pending state without a query per field.
  const { data: pendingRequestRows } = await supabase
    .from("requests")
    .select("change_payload")
    .eq("initiated_by", profile.personId)
    .eq("status", "open")
    .eq("category", "personal_data_change");
  type ChangePayload = { fieldName?: string; newValue?: string | null };
  const pendingByField = new Map<string, string | null>();
  for (const row of pendingRequestRows ?? []) {
    const payload = row.change_payload as ChangePayload | null;
    if (payload?.fieldName) pendingByField.set(payload.fieldName, payload.newValue ?? null);
  }

  const property = tenancy?.properties as unknown as PropertyRef | PropertyRef[] | null;
  const p = Array.isArray(property) ? property[0] : property;

  type PersonRef = { given_name: string; family_name: string; document_type: string | null; document_number: string | null; dob: string | null };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      <Card className="p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle>{t("tenancyTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {tenancy ? (
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("addressLabel")}</dt>
                <dd>{p?.address_line ?? p?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("termLabel")}</dt>
                <dd className="tabular-nums">
                  {tenancy.term_start} – {tenancy.term_end ?? t("ongoing")}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("dueDayLabel")}</dt>
                <dd className="tabular-nums">{t("dayOfMonth", { day: tenancy.due_day })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("noticeDaysLabel")}</dt>
                <dd className="tabular-nums">{t("days", { count: tenancy.notice_days })}</dd>
              </div>
              {tenancy.primary_tenant_registration_type && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("registrationTypeLabel")}</dt>
                  <dd>{tRegType(`registrationType_${tenancy.primary_tenant_registration_type}`)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noActiveTenancy")}</p>
          )}
        </CardContent>
      </Card>

      <Card className="p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle>{t("householdTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-0 pb-0">
          {selfRow && (
            <div className="rounded-md border border-border p-3">
              <p className="mb-1 text-sm font-medium">
                {selfRow.given_name} {selfRow.family_name} <span className="text-xs text-muted-foreground">({t("you")})</span>
              </p>
              {selfRow.document_type && (
                <p className="mb-2 text-xs text-muted-foreground">{tPerson(`documentType_${selfRow.document_type}`)}</p>
              )}
              <div className="divide-y divide-border">
                {PERSON_EDITABLE_FIELDS.map((field) => (
                  <EditablePersonField
                    key={field.key}
                    fieldKey={field.key}
                    label={tPerson(field.labelKey)}
                    value={selfRow[field.key] ?? null}
                    policy={resolveFieldPolicy(policyMap, field.key)}
                    inputType={field.inputType}
                    masked={PERSON_SENSITIVE_FIELD_KEYS.has(field.key)}
                    pendingNewValue={pendingByField.has(field.key) ? pendingByField.get(field.key) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
          {(occupantRows ?? []).map((o) => {
            const person = o.persons as unknown as PersonRef | PersonRef[] | null;
            const person2 = Array.isArray(person) ? person[0] : person;
            if (!person2) return null;
            return (
              <div key={o.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">
                  {person2.given_name} {person2.family_name}{" "}
                  <span className="text-xs text-muted-foreground">({tRegType(`relationship_${o.relationship}`)})</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {person2.document_type ? `${tPerson(`documentType_${person2.document_type}`)} · ${maskId(person2.document_number)}` : t("noDocumentOnFile")}
                  {person2.dob ? ` · ${person2.dob}` : ""}
                </p>
              </div>
            );
          })}
          {!selfRow && (occupantRows ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("noActiveTenancy")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
