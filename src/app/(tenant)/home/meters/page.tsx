import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { pickActiveSchedule, type ChargeScheduleInput } from "@/lib/billing/compute-statement";
import { MeterReadingFlow, type MeterFlowMeter } from "@/components/meter-reading-flow";

export default async function TenantMetersPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("id, unit_id")
    .eq("primary_tenant_id", profile.personId)
    .eq("status", "active")
    .maybeSingle();

  if (!tenancy) {
    return <MeterReadingFlow tenancyId={null} meters={[]} />;
  }

  const { data: meterRows } = await supabase
    .from("meters")
    .select("id, label, base_value, charge_type_id")
    .eq("unit_id", tenancy.unit_id)
    .is("removed_at", null);
  const meters = meterRows ?? [];

  const chargeTypeIds = [...new Set(meters.map((m) => m.charge_type_id))];
  const { data: chargeTypeRows } = chargeTypeIds.length
    ? await supabase.from("charge_types").select("id, unit").in("id", chargeTypeIds)
    : { data: [] };
  const unitByChargeType = new Map((chargeTypeRows ?? []).map((ct) => [ct.id, ct.unit ?? ""]));

  // Previous value = latest verified reading's confirmed_value, falling
  // back to the meter's base_value — same anchor submit-meter-reading.ts
  // uses server-side for the ≥previous check, so the display here and the
  // authoritative check line up.
  const meterIds = meters.map((m) => m.id);
  const { data: verifiedReadings } = meterIds.length
    ? await supabase
        .from("meter_readings")
        .select("meter_id, confirmed_value, reading_date, created_at")
        .in("meter_id", meterIds)
        .eq("status", "verified")
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [] };
  const latestVerifiedByMeter = new Map<string, { value: number; date: string }>();
  for (const r of verifiedReadings ?? []) {
    if (!latestVerifiedByMeter.has(r.meter_id) && r.confirmed_value != null) {
      latestVerifiedByMeter.set(r.meter_id, { value: Number(r.confirmed_value), date: r.reading_date });
    }
  }

  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const { data: thisMonthReadings } = meterIds.length
    ? await supabase
        .from("meter_readings")
        .select("meter_id, reading_date")
        .in("meter_id", meterIds)
        .gte("reading_date", `${currentMonthPrefix}-01`)
    : { data: [] };
  const doneThisMonth = new Set((thisMonthReadings ?? []).map((r) => r.meter_id));

  // D1: tenant_scope_metered_charge_schedules (0011) grants read access to
  // just the currently active metered rate for this tenancy — nothing
  // else. pickActiveSchedule applies the same "covers today" rule the
  // billing engine itself uses, so the estimate can't drift from what
  // actually gets billed.
  const { data: scheduleRows } = await supabase
    .from("charge_schedules")
    .select("id, charge_type_id, amount, rate_per_unit, valid_from, valid_to")
    .eq("tenancy_id", tenancy.id);
  const schedules: ChargeScheduleInput[] = (scheduleRows ?? []).map((s) => ({
    id: s.id,
    chargeTypeId: s.charge_type_id,
    amount: s.amount,
    ratePerUnit: s.rate_per_unit == null ? null : Number(s.rate_per_unit),
    validFrom: s.valid_from,
    validTo: s.valid_to,
  }));
  const today = new Date().toISOString().slice(0, 10);

  const flowMeters: MeterFlowMeter[] = meters.map((m) => {
    const verified = latestVerifiedByMeter.get(m.id);
    const activeSchedule = pickActiveSchedule(schedules, m.charge_type_id, today);
    return {
      id: m.id,
      label: m.label,
      unit: unitByChargeType.get(m.charge_type_id) ?? "",
      previousValue: verified ? verified.value : Number(m.base_value),
      previousDate: verified ? verified.date : null,
      ratePerUnit: activeSchedule?.ratePerUnit ?? null,
      doneThisMonth: doneThisMonth.has(m.id),
    };
  });

  return <MeterReadingFlow tenancyId={tenancy.id} meters={flowMeters} />;
}
