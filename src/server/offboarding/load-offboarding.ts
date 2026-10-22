import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { getPropertyModules } from "@/server/modules/get-modules";
import { computeDepositBalance, type DepositTransactionType } from "@/lib/deposits/compute-deposit-balance";
import { computeOffboardingProgress, type OffboardingProgress, type OffboardingStep } from "@/lib/offboarding/progress";
import { monthOf, proRataCredit } from "@/lib/offboarding/pro-rata";
import { addMonths } from "@/lib/month";
import type { DepositTransactionRow } from "@/components/deposit-section";

// audit_log actions the wizard writes on the tenancy (D-44).
export const OFFBOARDING_STARTED = "offboarding_started";
export const OFFBOARDING_STEP = "offboarding_step";

export interface OffboardingData {
  tenancy: {
    id: string;
    status: string;
    unitName: string;
    tenantName: string;
    termStart: string;
  };
  endDate: string | null;
  /** First day of the end month — the final statement's period. */
  endMonth: string | null;
  progress: OffboardingProgress;
  requestsModuleOn: boolean;
  openRequests: number;
  metersMissingFinalReading: { id: string; label: string }[];
  /** The live statement for the end month, if any. */
  endMonthStatement: { id: string; status: string; issuedAt: string | null; issuedBeforeStart: boolean } | null;
  /** Proposed pro-rata credit, or null when nothing to propose (or already added / statement issued). */
  proRata: { amount: number; unusedDays: number; daysInMonth: number; rent: number } | null;
  proRataAdded: boolean;
  depositBalance: number;
  depositTransactions: DepositTransactionRow[];
  outstandingTotal: number;
  activeInventoryItems: number;
  handoverNote: string | null;
  skipNotes: Partial<Record<OffboardingStep, string>>;
}

type StepEntry = { step: OffboardingStep; resolution: "done" | "skipped" | "reopened" | "prorata"; note?: string | null };

// Loads one tenancy's offboarding state (B-43). Every fact is read under
// the owner's own RLS scope; nothing here writes.
export async function loadOffboarding(supabase: SupabaseClient, tenancyId: string): Promise<OffboardingData | null> {
  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select("id, status, unit_id, property_id, term_start, properties(name), persons(given_name, family_name)")
    .eq("id", tenancyId)
    .maybeSingle();
  assertNoQueryError("offboarding/tenancy", tenancyError);
  if (!tenancy) return null;

  const { data: auditRows, error: auditError } = await supabase
    .from("audit_log")
    .select("action, after, at")
    .eq("entity_type", "tenancy")
    .eq("entity_id", tenancyId)
    .in("action", [OFFBOARDING_STARTED, OFFBOARDING_STEP])
    .order("at", { ascending: true });
  assertNoQueryError("offboarding/audit", auditError);

  // Latest "started" wins (the owner may correct the end date).
  const startedRow = [...(auditRows ?? [])].reverse().find((r) => r.action === OFFBOARDING_STARTED);
  const endDate = (startedRow?.after as { endDate?: string } | null)?.endDate ?? null;
  const startedAt = startedRow?.at ?? null;
  const endMonth = endDate ? monthOf(endDate) : null;

  // Latest entry per step decides skip/handover state.
  const latest = new Map<string, StepEntry>();
  let proRataAdded = false;
  for (const r of auditRows ?? []) {
    if (r.action !== OFFBOARDING_STEP) continue;
    const entry = r.after as StepEntry;
    if (entry.resolution === "prorata") proRataAdded = true;
    else latest.set(entry.step, entry);
  }
  const skipped = new Set<OffboardingStep>();
  const skipNotes: Partial<Record<OffboardingStep, string>> = {};
  for (const [step, entry] of latest) {
    if (entry.resolution === "skipped") {
      skipped.add(step as OffboardingStep);
      if (entry.note) skipNotes[step as OffboardingStep] = entry.note;
    }
  }
  const handoverEntry = latest.get("handover");
  const handoverNote = handoverEntry?.resolution === "done" ? (handoverEntry.note ?? "") : null;

  const nextMonth = endMonth ? addMonths(endMonth, 1) : null;
  const [modules, requestsRes, metersRes, readingsRes, statementRes, depositRes, rentRes, inventoryRes, unpaidRes] = await Promise.all([
    getPropertyModules(supabase, tenancy.property_id),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("tenancy_id", tenancyId).eq("status", "open"),
    supabase.from("meters").select("id, label, installed_at, removed_at").eq("unit_id", tenancy.unit_id),
    endMonth && nextMonth
      ? supabase
          .from("meter_readings")
          .select("meter_id")
          .eq("tenancy_id", tenancyId)
          .eq("status", "verified")
          .gte("reading_date", endMonth)
          .lt("reading_date", nextMonth)
      : Promise.resolve({ data: [], error: null }),
    endMonth
      ? supabase
          .from("statements")
          .select("id, status, issued_at")
          .eq("tenancy_id", tenancyId)
          .eq("period_month", endMonth)
          .is("voided_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("deposit_transactions")
      .select("id, type, amount, currency, transaction_date, note")
      .eq("tenancy_id", tenancyId)
      .order("transaction_date", { ascending: true }),
    endMonth
      ? supabase
          .from("charge_schedules")
          .select("amount, valid_from, valid_to, charge_types!inner(code)")
          .eq("tenancy_id", tenancyId)
          .eq("charge_types.code", "rent")
          .lte("valid_from", endMonth)
          .or(`valid_to.is.null,valid_to.gte.${endMonth}`)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("unit_id", tenancy.unit_id).eq("status", "active"),
    supabase
      .from("statements")
      .select("total, payments(amount)")
      .eq("tenancy_id", tenancyId)
      .in("status", ["issued", "partially_paid", "overdue"])
      .is("voided_at", null),
  ]);
  assertNoQueryError("offboarding/requests", requestsRes.error);
  assertNoQueryError("offboarding/meters", metersRes.error);
  assertNoQueryError("offboarding/readings", readingsRes.error);
  assertNoQueryError("offboarding/statement", statementRes.error);
  assertNoQueryError("offboarding/deposit", depositRes.error);
  assertNoQueryError("offboarding/rent", rentRes.error);
  assertNoQueryError("offboarding/inventory", inventoryRes.error);
  assertNoQueryError("offboarding/unpaid", unpaidRes.error);

  const requestsModuleOn = modules.has("requests");
  const openRequests = requestsModuleOn ? (requestsRes.count ?? 0) : 0;

  // In service during the end month: installed before it ends, not removed before it starts.
  const readMeterIds = new Set((readingsRes.data ?? []).map((r) => r.meter_id as string));
  const metersMissingFinalReading =
    endMonth && nextMonth
      ? (metersRes.data ?? [])
          .filter((m) => m.installed_at < nextMonth && (m.removed_at == null || m.removed_at >= endMonth))
          .filter((m) => !readMeterIds.has(m.id))
          .map((m) => ({ id: m.id as string, label: m.label as string }))
      : [];

  const statement = statementRes.data;
  const issuedBeforeStart = !!(statement?.issued_at && startedAt && statement.issued_at < startedAt);
  const endMonthStatement = statement
    ? { id: statement.id as string, status: statement.status as string, issuedAt: statement.issued_at as string | null, issuedBeforeStart }
    : null;
  // The final statement is the end month's one, issued after offboarding
  // started (so it carries the final readings and any credit). One issued
  // before that can't be amended (D-24) — the owner skips with a note.
  const finalStatementIssued = !!(endMonthStatement && endMonthStatement.status !== "draft" && !issuedBeforeStart);

  const depositTransactions: DepositTransactionRow[] = (depositRes.data ?? []).map((d) => ({
    id: d.id,
    type: d.type as DepositTransactionType,
    amount: Number(d.amount),
    currency: d.currency,
    transactionDate: d.transaction_date,
    note: d.note,
  }));
  const depositBalance = computeDepositBalance(depositTransactions);

  const outstandingTotal = (unpaidRes.data ?? []).reduce((sum, s) => {
    const paid = ((s.payments as { amount: number }[] | null) ?? []).reduce((p, x) => p + Number(x.amount), 0);
    return sum + Math.max(0, Number(s.total) - paid);
  }, 0);

  const rent = rentRes.data?.amount != null ? Number(rentRes.data.amount) : null;
  const statementStillOpen = !endMonthStatement || endMonthStatement.status === "draft";
  const credit = endDate && rent ? proRataCredit(rent, endDate) : null;
  const proRata = credit && rent && credit.amount > 0 && !proRataAdded && statementStillOpen ? { ...credit, rent } : null;

  const progress = computeOffboardingProgress({
    started: endDate != null,
    openRequests,
    metersMissingFinalReading: metersMissingFinalReading.length,
    finalStatementIssued,
    depositBalance,
    outstandingTotal,
    handoverRecorded: handoverNote != null,
    tenancyEnded: tenancy.status === "ended" || tenancy.status === "terminated",
    skipped,
  });

  type Named = { name: string };
  type PersonRef = { given_name: string; family_name: string };
  const unit = tenancy.properties as unknown as Named | Named[] | null;
  const person = tenancy.persons as unknown as PersonRef | PersonRef[] | null;
  const unitRef = Array.isArray(unit) ? unit[0] : unit;
  const personRef = Array.isArray(person) ? person[0] : person;

  return {
    tenancy: {
      id: tenancy.id,
      status: tenancy.status,
      unitName: unitRef?.name ?? "—",
      tenantName: personRef ? `${personRef.given_name} ${personRef.family_name}` : "—",
      termStart: tenancy.term_start,
    },
    endDate,
    endMonth,
    progress,
    requestsModuleOn,
    openRequests,
    metersMissingFinalReading,
    endMonthStatement,
    proRata,
    proRataAdded,
    depositBalance,
    depositTransactions,
    outstandingTotal,
    activeInventoryItems: inventoryRes.count ?? 0,
    handoverNote,
    skipNotes,
  };
}

