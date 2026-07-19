/**
 * One-off historical importer (Phase 1 M5) — replays the golden-source
 * spreadsheet into an EXISTING tenancy's billing tables. Does not create
 * the property/persons/tenancy themselves (that's seed.real.ts's job,
 * per /private/PRIVATE.md's own checklist) — this only backfills
 * charge_types/schedules/meters/readings/adjustments/statements/payments.
 *
 * Not unit-tested itself (same accepted scope boundary as the M4 server
 * actions) — its correctness rides on parse-sheet-months.ts,
 * replay-sheet-history.ts, reconcile-statement-total.ts and
 * compute-statement.ts, all separately tested. Real-data write: run only
 * on explicit instruction, never in CI.
 *
 * DRY_RUN=1 wraps the whole run in a transaction and throws at the end
 * instead of committing — exercises the id-remapping/insert-order logic
 * below (the one part of this file with no other test coverage) against
 * the synthetic fixture with zero residue. Known limitation: the
 * charge_schedules overlap guard is an INITIALLY DEFERRED trigger, so it
 * only fires at a real COMMIT and a dry run won't exercise it — covered
 * instead by replay-sheet-history.ts's own collapse tests, which prove
 * the ranges it produces don't overlap by construction.
 *
 * Usage:
 *   SHEET_FIXTURE_PATH=/private/sheet-export.xlsx IMPORT_TENANCY_ID=<uuid> \
 *     pnpm exec dotenv -e .env.local -- tsx scripts/import-sheet.ts
 *   DRY_RUN=1 SHEET_FIXTURE_PATH=fixtures/sheet-demo.csv IMPORT_TENANCY_ID=<uuid> \
 *     pnpm exec dotenv -e .env.local -- tsx scripts/import-sheet.ts
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import {
  chargeTypes,
  chargeSchedules,
  meters,
  meterReadings,
  adjustments,
  statements,
  statementLineItems,
  payments,
  tenancies,
  properties,
  propertyOwnership,
} from "../src/db/schema";
import { computeStatement, type ChargeTypeInput, type LineItemInput } from "../src/lib/billing/compute-statement";
import { readCsvGrid } from "../src/lib/billing/read-csv-grid";
import { readWorkbookGrid } from "../src/lib/billing/read-workbook-grid";
import { meterBaseValue, parseSheetMonths } from "../src/lib/billing/parse-sheet-months";
import { replaySheetHistory } from "../src/lib/billing/replay-sheet-history";
import { ROUNDING_CORRECTION_CODE, reconcileStatementTotal } from "../src/lib/billing/reconcile-statement-total";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const fixturePath = process.env.SHEET_FIXTURE_PATH;
const tenancyId = process.env.IMPORT_TENANCY_ID;
const dryRun = process.env.DRY_RUN === "1";
if (!fixturePath) throw new Error("SHEET_FIXTURE_PATH is not set");
if (!tenancyId) throw new Error("IMPORT_TENANCY_ID is not set");

const METERED_CODES = ["electricity", "gas", "water_bathroom", "water_kitchen"] as const;
// rounding_correction has no charge_type "kind" analogue in replay-sheet-history's
// output — it's an importer-only concept, added to the catalog here.
const ALL_CODES = [
  { code: "rent", kind: "fixed" as const },
  { code: "common_cost", kind: "fixed" as const },
  { code: "internet", kind: "fixed" as const },
  { code: "electricity", kind: "metered" as const },
  { code: "gas", kind: "metered" as const },
  { code: "water_bathroom", kind: "metered" as const },
  { code: "water_kitchen", kind: "metered" as const },
  { code: "other_adjustment", kind: "one_off" as const },
  { code: ROUNDING_CORRECTION_CODE, kind: "one_off" as const },
];

const DRY_RUN_SENTINEL = "__import_sheet_dry_run_rollback__";

async function runImport(tx: Tx) {
  const [tenancy] = await tx.select().from(tenancies).where(eq(tenancies.id, tenancyId!));
  if (!tenancy) throw new Error(`Tenancy ${tenancyId} not found`);

  const [unit] = await tx.select().from(properties).where(eq(properties.id, tenancy.unitId));
  if (!unit) throw new Error(`Unit ${tenancy.unitId} not found`);
  const [ownership] = await tx
    .select()
    .from(propertyOwnership)
    .where(eq(propertyOwnership.propertyId, unit.rootPropertyId));
  if (!ownership) throw new Error(`No owner found for property ${unit.rootPropertyId}`);
  const ownerPersonId = ownership.personId;

  const buffer = readFileSync(fixturePath!);
  const grid = extname(fixturePath!) === ".xlsx" ? readWorkbookGrid(buffer) : readCsvGrid(buffer.toString("utf8"));
  const months = parseSheetMonths(grid);
  const meterBaseValues = Object.fromEntries(
    METERED_CODES.map((code) => [code, meterBaseValue(grid, code)]),
  ) as Record<(typeof METERED_CODES)[number], number>;
  const replayed = replaySheetHistory(months, meterBaseValues);

  // 1. charge_types — reuse by code if this unit already has them (makes
  // a rerun after a partial failure not duplicate the catalog).
  const existingChargeTypes = await tx.select().from(chargeTypes).where(eq(chargeTypes.unitId, unit.id));
  const chargeTypeIdByCode = new Map(existingChargeTypes.filter((c) => c.code).map((c) => [c.code!, c.id]));
  const missingChargeTypes = ALL_CODES.filter((c) => !chargeTypeIdByCode.has(c.code));
  if (missingChargeTypes.length > 0) {
    const inserted = await tx
      .insert(chargeTypes)
      .values(missingChargeTypes.map((c) => ({ unitId: unit.id, kind: c.kind, code: c.code, name: c.code })))
      .returning();
    for (const row of inserted) chargeTypeIdByCode.set(row.code!, row.id);
  }
  console.log(`charge_types: ${chargeTypeIdByCode.size} available`);

  // 2. charge_schedules (fixed + metered rate schedules from replay).
  const scheduleRows = await tx
    .insert(chargeSchedules)
    .values(
      replayed.chargeSchedules.map((s) => ({
        tenancyId: tenancyId!,
        chargeTypeId: chargeTypeIdByCode.get(s.chargeTypeId)!,
        amount: s.amount,
        ratePerUnit: s.ratePerUnit == null ? null : String(s.ratePerUnit),
        validFrom: s.validFrom,
        validTo: s.validTo,
      })),
    )
    .returning();
  console.log(`charge_schedules: ${scheduleRows.length} inserted`);
  const scheduleIdByKey = new Map(replayed.chargeSchedules.map((s, i) => [s.id, scheduleRows[i].id]));

  // 3. meters (one per metered code that has at least one reading).
  const meterIdByCode = new Map<string, string>();
  for (const m of replayed.meters) {
    const [row] = await tx
      .insert(meters)
      .values({
        unitId: unit.id,
        chargeTypeId: chargeTypeIdByCode.get(m.chargeTypeId)!,
        label: m.label,
        baseValue: String(m.baseValue),
        installedAt: m.installedAt,
        removedAt: m.removedAt,
      })
      .returning();
    meterIdByCode.set(m.id, row.id);
  }
  console.log(`meters: ${meterIdByCode.size} inserted`);

  // 4. meter_readings — historical bulk import, status='verified' directly
  // (see module doc): entered/confirmed both set to the sheet's own value,
  // confirmedBy/enteredBy = the tenancy's owner (no distinct historical
  // actor to reconstruct — documented import-time convention).
  const readingIdByKey = new Map<string, string>();
  const readingRows = await tx
    .insert(meterReadings)
    .values(
      replayed.meterReadings.map((r) => ({
        meterId: meterIdByCode.get(r.meterId)!,
        tenancyId: tenancyId!,
        readingDate: r.readingDate,
        enteredValue: String(r.confirmedValue),
        enteredBy: ownerPersonId,
        confirmedValue: String(r.confirmedValue),
        confirmedBy: ownerPersonId,
        confirmedAt: new Date(r.createdAt),
        status: "verified" as const,
        source: "admin" as const,
      })),
    )
    .returning();
  for (let i = 0; i < replayed.meterReadings.length; i++) readingIdByKey.set(replayed.meterReadings[i].id, readingRows[i].id);
  console.log(`meter_readings: ${readingRows.length} inserted`);

  // 5. adjustments (real "Other" rows only — rounding-correction line
  // items are per-statement, added at persist time below, not here).
  const adjustmentIdByKey = new Map<string, string>();
  const adjustmentRows = await tx
    .insert(adjustments)
    .values(
      replayed.adjustments.map((a) => ({
        tenancyId: tenancyId!,
        chargeTypeId: chargeTypeIdByCode.get(a.chargeTypeId)!,
        amount: a.amount,
        reason: a.reason,
        targetMonth: a.targetMonth,
        targetMonthEnd: a.targetMonthEnd,
        createdBy: ownerPersonId,
      })),
    )
    .returning();
  for (let i = 0; i < replayed.adjustments.length; i++) adjustmentIdByKey.set(replayed.adjustments[i].id, adjustmentRows[i].id);
  console.log(`adjustments: ${adjustmentRows.length} inserted`);

  // computeStatement() itself still runs against the synthetic ids from
  // replaySheetHistory (already verified correct against these exact
  // inputs by the golden test) — only the *result*'s ids get translated
  // to real UUIDs, at persist time, right below.
  const chargeTypesInput: ChargeTypeInput[] = replayed.chargeTypes;

  function translateLineItem(li: LineItemInput, statementId: string) {
    return {
      statementId,
      chargeTypeId: chargeTypeIdByCode.get(li.chargeTypeId)!,
      description: li.description,
      quantity: li.quantity == null ? null : String(li.quantity),
      unitRate: li.unitRate == null ? null : String(li.unitRate),
      amount: li.amount,
      isBillable: li.isBillable,
      chargeScheduleId: li.chargeScheduleId ? (scheduleIdByKey.get(li.chargeScheduleId) ?? null) : null,
      meterId: li.meterId ? (meterIdByCode.get(li.meterId) ?? null) : null,
      fromReadingId: li.fromReadingId ? (readingIdByKey.get(li.fromReadingId) ?? null) : null,
      toReadingId: li.toReadingId ? (readingIdByKey.get(li.toReadingId) ?? null) : null,
      adjustmentId: li.adjustmentId ? (adjustmentIdByKey.get(li.adjustmentId) ?? null) : null,
      sortOrder: li.sortOrder,
    };
  }

  // 6. Per month: statement (skip on unique-violation, i.e. already
  // imported) -> line items -> payment.
  let imported = 0;
  let skipped = 0;
  for (const month of months) {
    const result = computeStatement({
      periodMonth: month.periodMonth,
      chargeTypes: chargeTypesInput,
      chargeSchedules: replayed.chargeSchedules,
      meters: replayed.meters,
      meterReadings: replayed.meterReadings,
      adjustments: replayed.adjustments,
    });
    const billedTotal = Math.round(month.sheetPayableTotal);
    const reconciled = reconcileStatementTotal(result, billedTotal);
    const dueDate = `${month.periodMonth.slice(0, 7)}-${String(tenancy.dueDay).padStart(2, "0")}`;

    let statementId: string;
    try {
      const [row] = await tx
        .insert(statements)
        .values({
          tenancyId: tenancyId!,
          periodMonth: month.periodMonth,
          status: "issued" as const,
          dueDate,
          total: reconciled.total,
          issuedAt: new Date(`${month.periodMonth}T00:00:00.000Z`),
          issuedSnapshot: { dueDay: tenancy.dueDay, reminderLeadDays: tenancy.reminderLeadDays, tenancyId, primaryTenantId: tenancy.primaryTenantId, importedFrom: fixturePath },
        })
        .returning();
      statementId = row.id;
    } catch (err) {
      if (err instanceof Error && /unique/i.test(err.message)) {
        console.log(`skip ${month.periodMonth}: already imported`);
        skipped++;
        continue;
      }
      throw err;
    }

    await tx.insert(statementLineItems).values(reconciled.lineItems.map((li) => translateLineItem(li, statementId)));

    // Real source has no per-installment amount when a month has two
    // payment dates — one row at the last date, for the full total (see
    // the M5 plan's real-data findings; not inventing a split).
    if (month.payments.length > 0) {
      const lastDate = month.payments[month.payments.length - 1].paidAt;
      if (month.payments.length > 1) {
        console.warn(`${month.periodMonth}: ${month.payments.length} payment dates in source, no per-installment amount — importing one payment at ${lastDate} for the full total`);
      }
      await tx.insert(payments).values({
        statementId,
        amount: reconciled.total,
        paidAt: lastDate,
        method: "bank_transfer" as const,
        recordedBy: ownerPersonId,
      });
    }

    imported++;
  }

  console.log(`${dryRun ? "[dry run] " : ""}Done: ${imported} statements imported, ${skipped} skipped (already present).`);

  if (dryRun) throw new Error(DRY_RUN_SENTINEL);
}

async function main() {
  try {
    await db.transaction(runImport);
  } catch (err) {
    if (dryRun && err instanceof Error && err.message === DRY_RUN_SENTINEL) {
      console.log("[dry run] rolled back, nothing persisted.");
      return;
    }
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
