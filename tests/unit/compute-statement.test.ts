import { describe, expect, it } from "vitest";
import {
  computeStatement,
  type AdjustmentInput,
  type ChargeScheduleInput,
  type ChargeTypeInput,
  type MeterInput,
  type MeterReadingInput,
} from "../../src/lib/billing/compute-statement";

// No DB, no `postgres` import — the first pure-function test in the repo
// (everything else in tests/unit/ hits the real cloud Supabase project via
// SUPABASE_DB_URL). Runs instantly, no .env.local needed for this file.

const rentType: ChargeTypeInput = { id: "ct-rent", kind: "fixed", name: "Rent" };
const electricityType: ChargeTypeInput = { id: "ct-electricity", kind: "metered", name: "Electricity" };
const gasType: ChargeTypeInput = { id: "ct-gas", kind: "tracked_only", name: "Gas" };
const cleaningType: ChargeTypeInput = { id: "ct-cleaning", kind: "one_off", name: "Cleaning fee" };

const electricityMeter: MeterInput = {
  id: "meter-electricity",
  chargeTypeId: electricityType.id,
  label: "Electricity",
  baseValue: 1000,
  installedAt: "2026-01-01",
  removedAt: null,
};

function reading(overrides: Partial<MeterReadingInput> & { id: string }): MeterReadingInput {
  return {
    meterId: electricityMeter.id,
    readingDate: "2026-01-01",
    createdAt: "2026-01-01T00:00:00Z",
    confirmedValue: 0,
    ...overrides,
  };
}

describe("computeStatement", () => {
  it("bills a fixed charge in force for the whole month", () => {
    const schedule: ChargeScheduleInput = {
      id: "sched-rent",
      chargeTypeId: rentType.id,
      amount: 250_000,
      ratePerUnit: null,
      validFrom: "2026-01-01",
      validTo: null,
    };
    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [rentType],
      chargeSchedules: [schedule],
      meters: [],
      meterReadings: [],
      adjustments: [],
    });
    expect(result.warnings).toEqual([]);
    expect(result.lineItems).toEqual([
      {
        chargeTypeId: rentType.id,
        description: "Rent",
        quantity: null,
        unitRate: null,
        amount: 250_000,
        isBillable: true,
        chargeScheduleId: schedule.id,
        meterId: null,
        fromReadingId: null,
        toReadingId: null,
        adjustmentId: null,
        sortOrder: 0,
      },
    ]);
    expect(result.total).toBe(250_000);
  });

  it("warns and skips a fixed charge type with no covering schedule, excluded from total", () => {
    // `active` isn't part of ChargeTypeInput at all — there is no field
    // for the pure function to key off, so a deactivated charge_type
    // behaves identically to any other unscheduled one by construction.
    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [rentType],
      chargeSchedules: [],
      meters: [],
      meterReadings: [],
      adjustments: [],
    });
    expect(result.lineItems).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.warnings).toEqual(["no active rate for Rent in 2026-02-01"]);
  });

  it("computes a metered delta from a previous verified reading, not always meter.baseValue", () => {
    const schedule: ChargeScheduleInput = {
      id: "sched-electricity",
      chargeTypeId: electricityType.id,
      amount: null,
      ratePerUnit: 70,
      validFrom: "2026-01-01",
      validTo: null,
    };
    // This reading stands in for one taken during a *prior tenancy's*
    // occupancy of the same physical meter — the pure function has no
    // tenancyId field at all to filter on, so it's structurally
    // guaranteed to be picked up regardless of which tenancy "owned" it.
    // This is the exact scenario the M1 plan flagged: baseValue is only
    // the anchor for a meter's first-ever reading, not every reading.
    const priorTenancyReading = reading({ id: "r-prior-tenancy", readingDate: "2026-01-31", confirmedValue: 1500 });
    const thisMonthReading = reading({ id: "r-this-month", readingDate: "2026-02-28", confirmedValue: 1620 });

    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [electricityType],
      chargeSchedules: [schedule],
      meters: [electricityMeter],
      meterReadings: [priorTenancyReading, thisMonthReading],
      adjustments: [],
    });

    expect(result.warnings).toEqual([]);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]).toMatchObject({
      quantity: 120, // 1620 - 1500, not 1620 - 1000 (baseValue)
      unitRate: 70,
      amount: 8400,
      fromReadingId: "r-prior-tenancy",
      toReadingId: "r-this-month",
    });
    expect(result.total).toBe(8400);
  });

  it("falls back to meter.baseValue only when no previous reading exists at all", () => {
    const schedule: ChargeScheduleInput = {
      id: "sched-electricity",
      chargeTypeId: electricityType.id,
      amount: null,
      ratePerUnit: 70,
      validFrom: "2026-01-01",
      validTo: null,
    };
    const firstReading = reading({ id: "r-first", readingDate: "2026-01-15", confirmedValue: 1050 });

    const result = computeStatement({
      periodMonth: "2026-01-01",
      chargeTypes: [electricityType],
      chargeSchedules: [schedule],
      meters: [electricityMeter],
      meterReadings: [firstReading],
      adjustments: [],
    });

    expect(result.lineItems[0]).toMatchObject({
      quantity: 50, // 1050 - baseValue(1000)
      fromReadingId: null, // anchor came from baseValue, not a reading row
      toReadingId: "r-first",
    });
  });

  it("produces a non-billable line item for a tracked_only meter, still with quantity/description", () => {
    const from = reading({ id: "r-from", meterId: "meter-gas", readingDate: "2026-01-31", confirmedValue: 100 });
    const to = reading({ id: "r-to", meterId: "meter-gas", readingDate: "2026-02-20", confirmedValue: 145 });
    const gasMeter: MeterInput = {
      id: "meter-gas",
      chargeTypeId: gasType.id,
      label: "Gas",
      baseValue: 0,
      installedAt: "2026-01-01",
      removedAt: null,
    };

    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [gasType],
      chargeSchedules: [],
      meters: [gasMeter],
      meterReadings: [from, to],
      adjustments: [],
    });

    expect(result.warnings).toEqual([]); // tracked_only never needs a rate schedule
    expect(result.lineItems).toEqual([
      {
        chargeTypeId: gasType.id,
        description: "Gas (Gas)",
        quantity: 45,
        unitRate: null,
        amount: 0,
        isBillable: false,
        chargeScheduleId: null,
        meterId: gasMeter.id,
        fromReadingId: "r-from",
        toReadingId: "r-to",
        adjustmentId: null,
        sortOrder: 0,
      },
    ]);
    expect(result.total).toBe(0);
  });

  it("warns and skips a meter with a prior-period reading but none in the current period (not a phantom zero)", () => {
    const schedule: ChargeScheduleInput = {
      id: "sched-electricity",
      chargeTypeId: electricityType.id,
      amount: null,
      ratePerUnit: 70,
      validFrom: "2026-01-01",
      validTo: null,
    };
    // Built with a real reading present in an *earlier* period — a zero-
    // readings-total fixture would pass even against the bug where `to`
    // has no lower bound and silently reuses this stale reading, matching
    // it as if it were this period's reading (delta 0, no warning). This
    // fixture is the one that actually discriminates.
    const januaryReading = reading({ id: "r-january", readingDate: "2026-01-28", confirmedValue: 1500 });

    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [electricityType],
      chargeSchedules: [schedule],
      meters: [electricityMeter],
      meterReadings: [januaryReading],
      adjustments: [],
    });

    expect(result.lineItems).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.warnings).toEqual(["Electricity has no reading for 2026-02-01"]);
  });

  it("splits a mid-period meter replacement into two line items, each delta'd from its own history, summed into the total", () => {
    const schedule: ChargeScheduleInput = {
      id: "sched-electricity",
      chargeTypeId: electricityType.id,
      amount: null,
      ratePerUnit: 10,
      validFrom: "2026-01-01",
      validTo: null,
    };
    const oldMeter: MeterInput = {
      id: "meter-old",
      chargeTypeId: electricityType.id,
      label: "Electricity (old)",
      baseValue: 0,
      installedAt: "2026-01-01",
      removedAt: "2026-02-15",
    };
    const newMeter: MeterInput = {
      id: "meter-new",
      chargeTypeId: electricityType.id,
      label: "Electricity (new)",
      baseValue: 0,
      installedAt: "2026-02-15",
      removedAt: null,
    };
    const oldMeterStart = reading({ id: "r-old-start", meterId: oldMeter.id, readingDate: "2026-01-31", confirmedValue: 500 });
    const oldMeterFinal = reading({ id: "r-old-final", meterId: oldMeter.id, readingDate: "2026-02-15", confirmedValue: 540 });
    const newMeterFirst = reading({ id: "r-new-first", meterId: newMeter.id, readingDate: "2026-02-28", confirmedValue: 25 });

    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [electricityType],
      chargeSchedules: [schedule],
      meters: [oldMeter, newMeter],
      meterReadings: [oldMeterStart, oldMeterFinal, newMeterFirst],
      adjustments: [],
    });

    expect(result.warnings).toEqual([]);
    expect(result.lineItems).toHaveLength(2);
    const oldLine = result.lineItems.find((li) => li.meterId === oldMeter.id)!;
    const newLine = result.lineItems.find((li) => li.meterId === newMeter.id)!;
    expect(oldLine).toMatchObject({ quantity: 40, amount: 400 }); // 540 - 500
    expect(newLine).toMatchObject({ quantity: 25, amount: 250, fromReadingId: null }); // 25 - baseValue(0)
    expect(result.total).toBe(650);
  });

  it("includes a single-month adjustment", () => {
    const adjustment: AdjustmentInput = {
      id: "adj-1",
      chargeTypeId: cleaningType.id,
      amount: 15_000,
      reason: "Deep clean after move-out",
      targetMonth: "2026-02-01",
      targetMonthEnd: null,
      voidedAt: null,
    };
    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [],
      chargeSchedules: [],
      meters: [],
      meterReadings: [],
      adjustments: [adjustment],
    });
    expect(result.lineItems).toEqual([
      {
        chargeTypeId: cleaningType.id,
        description: "Deep clean after move-out",
        quantity: null,
        unitRate: null,
        amount: 15_000,
        isBillable: true,
        chargeScheduleId: null,
        meterId: null,
        fromReadingId: null,
        toReadingId: null,
        adjustmentId: adjustment.id,
        sortOrder: 0,
      },
    ]);
    expect(result.total).toBe(15_000);
  });

  it("includes a bounded-range recurring adjustment when the period falls inside it", () => {
    const adjustment: AdjustmentInput = {
      id: "adj-recurring",
      chargeTypeId: cleaningType.id,
      amount: 5_000,
      reason: "Temporary parking surcharge",
      targetMonth: "2026-01-01",
      targetMonthEnd: "2026-03-01",
      voidedAt: null,
    };
    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [],
      chargeSchedules: [],
      meters: [],
      meterReadings: [],
      adjustments: [adjustment],
    });
    expect(result.lineItems).toHaveLength(1);
    expect(result.total).toBe(5_000);
  });

  it("excludes a voided adjustment", () => {
    const adjustment: AdjustmentInput = {
      id: "adj-voided",
      chargeTypeId: cleaningType.id,
      amount: 5_000,
      reason: "Mistaken charge",
      targetMonth: "2026-02-01",
      targetMonthEnd: null,
      voidedAt: "2026-02-10T00:00:00Z",
    };
    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [],
      chargeSchedules: [],
      meters: [],
      meterReadings: [],
      adjustments: [adjustment],
    });
    expect(result.lineItems).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("excludes an adjustment outside its target range", () => {
    const adjustment: AdjustmentInput = {
      id: "adj-out-of-range",
      chargeTypeId: cleaningType.id,
      amount: 5_000,
      reason: "January-only charge",
      targetMonth: "2026-01-01",
      targetMonthEnd: null,
      voidedAt: null,
    };
    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [],
      chargeSchedules: [],
      meters: [],
      meterReadings: [],
      adjustments: [adjustment],
    });
    expect(result.lineItems).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("rounds a fractional delta × rate per line", () => {
    const schedule: ChargeScheduleInput = {
      id: "sched-electricity",
      chargeTypeId: electricityType.id,
      amount: null,
      ratePerUnit: 33.333,
      validFrom: "2026-01-01",
      validTo: null,
    };
    const from = reading({ id: "r-from", readingDate: "2026-01-31", confirmedValue: 1000 });
    const to = reading({ id: "r-to", readingDate: "2026-02-28", confirmedValue: 1003 }); // delta 3 -> 99.999

    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [electricityType],
      chargeSchedules: [schedule],
      meters: [electricityMeter],
      meterReadings: [from, to],
      adjustments: [],
    });

    expect(result.lineItems[0].amount).toBe(100); // Math.round(99.999)
    expect(result.total).toBe(100);
  });

  it("treats a verified reading with a null confirmedValue as no reading at all", () => {
    const schedule: ChargeScheduleInput = {
      id: "sched-electricity",
      chargeTypeId: electricityType.id,
      amount: null,
      ratePerUnit: 70,
      validFrom: "2026-01-01",
      validTo: null,
    };
    // MeterReadingInput has no enteredValue field at all — there is
    // nothing for the function to silently fall back to.
    const nullConfirmed = reading({ id: "r-null", readingDate: "2026-02-10", confirmedValue: null });

    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [electricityType],
      chargeSchedules: [schedule],
      meters: [electricityMeter],
      meterReadings: [nullConfirmed],
      adjustments: [],
    });

    expect(result.lineItems).toEqual([]);
    expect(result.warnings).toEqual(["Electricity has no reading for 2026-02-01"]);
  });

  it("total always equals the sum of all included line items", () => {
    const rentSchedule: ChargeScheduleInput = {
      id: "sched-rent",
      chargeTypeId: rentType.id,
      amount: 200_000,
      ratePerUnit: null,
      validFrom: "2026-01-01",
      validTo: null,
    };
    const electricitySchedule: ChargeScheduleInput = {
      id: "sched-electricity",
      chargeTypeId: electricityType.id,
      amount: null,
      ratePerUnit: 70,
      validFrom: "2026-01-01",
      validTo: null,
    };
    const from = reading({ id: "r-from", readingDate: "2026-01-31", confirmedValue: 1000 });
    const to = reading({ id: "r-to", readingDate: "2026-02-28", confirmedValue: 1100 });
    const adjustment: AdjustmentInput = {
      id: "adj-credit",
      chargeTypeId: cleaningType.id,
      amount: -10_000,
      reason: "Goodwill credit",
      targetMonth: "2026-02-01",
      targetMonthEnd: null,
      voidedAt: null,
    };

    const result = computeStatement({
      periodMonth: "2026-02-01",
      chargeTypes: [rentType, electricityType],
      chargeSchedules: [rentSchedule, electricitySchedule],
      meters: [electricityMeter],
      meterReadings: [from, to],
      adjustments: [adjustment],
    });

    const summed = result.lineItems.reduce((sum, li) => sum + li.amount, 0);
    expect(result.total).toBe(summed);
    expect(result.total).toBe(200_000 + 7_000 - 10_000);
  });
});
