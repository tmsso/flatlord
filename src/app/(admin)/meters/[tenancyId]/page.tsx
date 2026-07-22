import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pickActiveSchedule, type ChargeScheduleInput } from "@/lib/billing/compute-statement";
import { MeterVerificationPanel, type AdminMeterRow } from "@/components/meter-verification-panel";

function nextMonthStart(periodMonth: string): string {
  const [year, month] = periodMonth.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return next;
}

export default async function AdminMeterVerificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenancyId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { tenancyId } = await params;
  const { month } = await searchParams;
  const supabase = await createClient();

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("id, unit_id, persons(given_name, family_name)")
    .eq("id", tenancyId)
    .maybeSingle();
  if (!tenancy) notFound();

  const periodMonth = month ?? new Date().toISOString().slice(0, 7);
  const periodStart = `${periodMonth}-01`;
  const periodEnd = nextMonthStart(periodMonth);
  const person = Array.isArray(tenancy.persons) ? tenancy.persons[0] : tenancy.persons;

  const { data: meterRows } = await supabase
    .from("meters")
    .select("id, label, base_value, charge_type_id")
    .eq("unit_id", tenancy.unit_id)
    .is("removed_at", null);
  const meters = meterRows ?? [];
  const meterIds = meters.map((m) => m.id);

  const chargeTypeIds = [...new Set(meters.map((m) => m.charge_type_id))];
  const { data: chargeTypeRows } = chargeTypeIds.length
    ? await supabase.from("charge_types").select("id, unit").in("id", chargeTypeIds)
    : { data: [] };
  const unitByChargeType = new Map((chargeTypeRows ?? []).map((ct) => [ct.id, ct.unit ?? ""]));

  const { data: monthReadingRows } = meterIds.length
    ? await supabase
        .from("meter_readings")
        .select("id, meter_id, entered_value, confirmed_value, ocr_value, ocr_confidence, photo_path, status, created_at")
        .in("meter_id", meterIds)
        .gte("reading_date", periodStart)
        .lt("reading_date", periodEnd)
    : { data: [] };

  // Previous value = latest verified reading strictly before this period,
  // falling back to the meter's base_value — same anchor the billing
  // engine (findFromValue in compute-statement.ts) uses.
  const { data: priorVerifiedRows } = meterIds.length
    ? await supabase
        .from("meter_readings")
        .select("meter_id, confirmed_value, reading_date")
        .in("meter_id", meterIds)
        .eq("status", "verified")
        .lt("reading_date", periodStart)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [] };
  const previousByMeter = new Map<string, { value: number; date: string }>();
  for (const r of priorVerifiedRows ?? []) {
    if (!previousByMeter.has(r.meter_id) && r.confirmed_value != null) {
      previousByMeter.set(r.meter_id, { value: Number(r.confirmed_value), date: r.reading_date });
    }
  }

  // Owner has full charge_schedules access — the rate this period's
  // statement will actually use, via the same pickActiveSchedule rule.
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

  const readingsByMeter = new Map<string, typeof monthReadingRows>();
  for (const r of monthReadingRows ?? []) {
    const list = readingsByMeter.get(r.meter_id) ?? [];
    list.push(r);
    readingsByMeter.set(r.meter_id, list);
  }

  const photoPaths = (monthReadingRows ?? []).map((r) => r.photo_path).filter((p): p is string => p != null);
  const { data: signedUrls } = photoPaths.length
    ? await supabase.storage.from("meter-photos").createSignedUrls(photoPaths, 600)
    : { data: [] };
  const signedUrlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const meterRowsForPanel: AdminMeterRow[] = meters.map((m) => {
    const previous = previousByMeter.get(m.id);
    const activeSchedule = pickActiveSchedule(schedules, m.charge_type_id, periodStart);
    return {
      id: m.id,
      label: m.label,
      unit: unitByChargeType.get(m.charge_type_id) ?? "",
      previousValue: previous ? previous.value : Number(m.base_value),
      previousDate: previous ? previous.date : null,
      ratePerUnit: activeSchedule?.ratePerUnit ?? null,
      readings: (readingsByMeter.get(m.id) ?? []).map((r) => ({
        id: r.id,
        enteredValue: Number(r.entered_value),
        confirmedValue: r.confirmed_value == null ? null : Number(r.confirmed_value),
        ocrValue: r.ocr_value == null ? null : Number(r.ocr_value),
        ocrConfidence: r.ocr_confidence == null ? null : Number(r.ocr_confidence),
        status: r.status,
        createdAt: r.created_at,
        photoUrl: r.photo_path ? (signedUrlByPath.get(r.photo_path) ?? null) : null,
      })),
    };
  });

  return (
    <MeterVerificationPanel
      tenancyId={tenancy.id}
      tenantName={person ? `${person.given_name} ${person.family_name}` : "—"}
      periodMonth={periodMonth}
      meters={meterRowsForPanel}
    />
  );
}
