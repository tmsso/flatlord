import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { getTenantAccess, type TenantAccess } from "@/server/tenancies/get-tenant-access";
import { computeProgress, type OnboardingFacts, type OnboardingFlow, type OnboardingProgress } from "@/lib/onboarding/progress";
import type { ChargeTypeRow, MeterRow } from "@/components/billing-setup/unit-billing-setup";
import type { ChargeScheduleRow } from "@/components/billing-setup/tenancy-rates";

const PERSON_FIELDS =
  "id, given_name, family_name, document_type, document_number, dob, birth_name, birth_place, mothers_name, citizenship, address_card_number, tax_id, phone, contact_email, registered_address, temporary_address";

export interface OnboardingData {
  flow: OnboardingFlow;
  progress: OnboardingProgress;
  me: Record<string, string | null> & { id: string; given_name: string; family_name: string };
  units: { id: string; name: string; type: string }[];
  /** Root properties the owner can nest a new flat/room under. */
  parentCandidates: { id: string; name: string; type: string }[];
  unit: { id: string; name: string } | null;
  chargeTypes: ChargeTypeRow[];
  meters: MeterRow[];
  persons: { id: string; name: string }[];
  tenancy: { id: string; termStart: string; tenantName: string; tenantEmail: string | null } | null;
  schedules: ChargeScheduleRow[];
  lastBilledPeriod: string | null;
  tenantAccess: TenantAccess | null;
}

// Loads everything the wizard needs and derives progress from it (B-42).
// "Focus" unit/tenancy: an explicit id from the URL (kept as the owner
// moves through the steps) or, in the full flow, the owner's newest one —
// so a returning owner lands back on the flat they started.
export async function loadOnboarding(
  supabase: SupabaseClient,
  flow: OnboardingFlow,
  params: { unit?: string; tenancy?: string },
): Promise<OnboardingData> {
  const profile = await getCurrentProfile(supabase);

  const [{ data: me, error: meError }, { data: ownRows, error: ownError }] = await Promise.all([
    supabase.from("persons").select(PERSON_FIELDS).eq("id", profile.personId).single(),
    supabase.from("property_ownership").select("property_id").eq("person_id", profile.personId),
  ]);
  assertNoQueryError("onboarding/me", meError);
  assertNoQueryError("onboarding/ownership", ownError);
  const roots = (ownRows ?? []).map((r) => r.property_id as string);

  const { data: propertyRows, error: propertiesError } = roots.length
    ? await supabase
        .from("properties")
        .select("id, name, type, parent_id, created_at")
        .in("root_property_id", roots)
        .eq("active", true)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  assertNoQueryError("onboarding/properties", propertiesError);
  const units = (propertyRows ?? []).filter((p) => p.type !== "house").map((p) => ({ id: p.id, name: p.name, type: p.type }));
  const parentCandidates = (propertyRows ?? [])
    .filter((p) => p.type === "house" || (p.type === "flat" && p.parent_id === null))
    .map((p) => ({ id: p.id, name: p.name, type: p.type }));

  const unit =
    units.find((u) => u.id === params.unit) ?? (flow === "full" && !params.unit ? (units[0] ?? null) : null);

  const [{ data: ctRows, error: ctError }, { data: meterRows, error: meterError }, { data: tenancyRows, error: tenancyError }, { data: personRows }] =
    await Promise.all([
      unit
        ? supabase.from("charge_types").select("id, code, name, kind, unit, active").eq("unit_id", unit.id).order("sort_order")
        : Promise.resolve({ data: [], error: null }),
      unit
        ? supabase.from("meters").select("id, label, charge_type_id, base_value, installed_at, removed_at").eq("unit_id", unit.id).order("installed_at")
        : Promise.resolve({ data: [], error: null }),
      unit
        ? supabase
            .from("tenancies")
            .select("id, term_start, created_at, persons(given_name, family_name, contact_email)")
            .eq("unit_id", unit.id)
            .neq("status", "terminated")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase.from("persons").select("id, given_name, family_name").neq("id", profile.personId).order("family_name"),
    ]);
  assertNoQueryError("onboarding/charge_types", ctError);
  assertNoQueryError("onboarding/meters", meterError);
  assertNoQueryError("onboarding/tenancies", tenancyError);

  const chargeTypes: ChargeTypeRow[] = (ctRows ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    kind: c.kind as ChargeTypeRow["kind"],
    unit: c.unit,
    active: c.active,
  }));
  const meters: MeterRow[] = (meterRows ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    chargeTypeId: m.charge_type_id,
    baseValue: Number(m.base_value),
    installedAt: m.installed_at,
    removedAt: m.removed_at,
  }));

  // The tenant flow always means a *new* tenancy: only an explicit id counts.
  const tenancyRow =
    (tenancyRows ?? []).find((t) => t.id === params.tenancy) ?? (flow === "full" && !params.tenancy ? tenancyRows?.[0] : undefined);
  type PersonRef = { given_name: string; family_name: string; contact_email: string | null };
  const tenantRef = tenancyRow ? (tenancyRow.persons as unknown as PersonRef | PersonRef[] | null) : null;
  const tenant = Array.isArray(tenantRef) ? tenantRef[0] : tenantRef;
  const tenancy = tenancyRow
    ? {
        id: tenancyRow.id as string,
        termStart: tenancyRow.term_start as string,
        tenantName: tenant ? `${tenant.given_name} ${tenant.family_name}` : "—",
        tenantEmail: tenant?.contact_email ?? null,
      }
    : null;

  let schedules: ChargeScheduleRow[] = [];
  let lastBilledPeriod: string | null = null;
  let tenantAccess: TenantAccess | null = null;
  if (tenancy) {
    const [{ data: scheduleRows, error: schedulesError }, { data: lastBilled, error: lastBilledError }, { data: tenancyFull }] = await Promise.all([
      supabase.from("charge_schedules").select("id, charge_type_id, amount, rate_per_unit, valid_from, valid_to").eq("tenancy_id", tenancy.id),
      supabase
        .from("statements")
        .select("period_month")
        .eq("tenancy_id", tenancy.id)
        .neq("status", "draft")
        .is("voided_at", null)
        .order("period_month", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("tenancies").select("primary_tenant_id").eq("id", tenancy.id).single(),
    ]);
    assertNoQueryError("onboarding/schedules", schedulesError);
    assertNoQueryError("onboarding/last_billed", lastBilledError);
    schedules = (scheduleRows ?? []).map((r) => ({
      id: r.id,
      chargeTypeId: r.charge_type_id,
      amount: r.amount == null ? null : Number(r.amount),
      ratePerUnit: r.rate_per_unit == null ? null : Number(r.rate_per_unit),
      validFrom: r.valid_from,
      validTo: r.valid_to,
    }));
    lastBilledPeriod = lastBilled?.period_month ?? null;
    if (tenancyFull) tenantAccess = await getTenantAccess(supabase, tenancyFull.primary_tenant_id);
  }

  const activeTypes = chargeTypes.filter((c) => c.active);
  const billable = activeTypes.filter((c) => c.kind === "fixed" || c.kind === "metered");
  const facts: OnboardingFacts = {
    ownNameSet: (me?.family_name ?? "").trim() !== "",
    hasUnit: unit != null,
    billingReady:
      activeTypes.length > 0 &&
      activeTypes
        .filter((c) => c.kind === "metered")
        .every((c) => meters.some((m) => m.chargeTypeId === c.id && m.removedAt == null)),
    hasTenancy: tenancy != null,
    ratesSet: billable.length > 0 && billable.every((c) => schedules.some((s) => s.chargeTypeId === c.id)),
    tenantInvited: tenantAccess != null && tenantAccess.kind !== "none",
  };

  return {
    flow,
    progress: computeProgress(flow, facts),
    me: me as OnboardingData["me"],
    units,
    parentCandidates,
    unit: unit ? { id: unit.id, name: unit.name } : null,
    chargeTypes,
    meters,
    persons: (personRows ?? []).map((p) => ({ id: p.id, name: `${p.given_name} ${p.family_name}` })),
    tenancy,
    schedules,
    lastBilledPeriod,
    tenantAccess,
  };
}
