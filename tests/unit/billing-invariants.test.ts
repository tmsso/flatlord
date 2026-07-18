import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL) — no
// local Postgres is available on this node. See project memory. Plain
// superuser connection, no RLS/auth.uid() forging — mirrors
// letting-mode-invariant.test.ts, covering the Phase 1 M1 billing/meter
// triggers instead of the properties-tree ones.
const sql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let houseId: string;
let flatId: string;
let personId: string;
let tenancyId: string;
let rentTypeId: string; // fixed
let electricityTypeId: string; // metered
let gasTypeId: string; // tracked_only
let adhocTypeId: string; // one_off

// Rows that survive their `it` (rejected inserts, and the statement/line-
// item tests below that deliberately roll back their whole transaction,
// leave nothing behind — only real committed rows need explicit cleanup).
const meterIds: string[] = [];

beforeAll(async () => {
  houseId = randomUUID();
  await sql`
    insert into properties (id, root_property_id, parent_id, type, name, active)
    values (${houseId}, ${houseId}, null, 'house', 'BI Test House', true)
  `;
  const [flat] = await sql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'BI Test Flat', 'whole', true)
    returning id
  `;
  flatId = flat.id;

  const [person] = await sql`
    insert into persons (given_name, family_name) values ('BI Test', 'Person') returning id
  `;
  personId = person.id;

  const [tenancy] = await sql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatId}, ${personId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyId = tenancy.id;

  const [rent] = await sql`
    insert into charge_types (unit_id, kind, name) values (${flatId}, 'fixed', 'BI Rent') returning id
  `;
  const [electricity] = await sql`
    insert into charge_types (unit_id, kind, name, unit)
    values (${flatId}, 'metered', 'BI Electricity', 'kWh') returning id
  `;
  const [gas] = await sql`
    insert into charge_types (unit_id, kind, name, unit)
    values (${flatId}, 'tracked_only', 'BI Gas', 'm3') returning id
  `;
  const [adhoc] = await sql`
    insert into charge_types (unit_id, kind, name) values (${flatId}, 'one_off', 'BI Cleaning Fee') returning id
  `;
  rentTypeId = rent.id;
  electricityTypeId = electricity.id;
  gasTypeId = gas.id;
  adhocTypeId = adhoc.id;
});

afterAll(async () => {
  if (meterIds.length) await sql`delete from meters where id = any(${meterIds})`;
  await sql`delete from charge_schedules where tenancy_id = ${tenancyId}`;
  await sql`delete from charge_types where unit_id = ${flatId}`;
  await sql`delete from tenancies where id = ${tenancyId}`;
  await sql`delete from persons where id = ${personId}`;
  await sql`delete from properties where name like 'BI Test%'`;
  await sql.end();
});

describe("charge_schedules: kind-gating", () => {
  it("rejects a fixed schedule with rate_per_unit set instead of amount", async () => {
    await expect(
      sql`
        insert into charge_schedules (tenancy_id, charge_type_id, rate_per_unit, valid_from)
        values (${tenancyId}, ${rentTypeId}, 70, '2027-01-01')
      `,
    ).rejects.toThrow(/fixed charge_schedule requires amount/i);
  });

  it("rejects a metered schedule with amount set instead of rate_per_unit", async () => {
    await expect(
      sql`
        insert into charge_schedules (tenancy_id, charge_type_id, amount, valid_from)
        values (${tenancyId}, ${electricityTypeId}, 25000, '2027-01-01')
      `,
    ).rejects.toThrow(/metered charge_schedule requires rate_per_unit/i);
  });

  it("rejects a charge_schedule referencing a tracked_only charge_type", async () => {
    await expect(
      sql`
        insert into charge_schedules (tenancy_id, charge_type_id, rate_per_unit, valid_from)
        values (${tenancyId}, ${gasTypeId}, 300, '2027-01-01')
      `,
    ).rejects.toThrow(/tracked_only needs no rate/i);
  });

  it("rejects a charge_schedule referencing a one_off charge_type", async () => {
    await expect(
      sql`
        insert into charge_schedules (tenancy_id, charge_type_id, amount, valid_from)
        values (${tenancyId}, ${adhocTypeId}, 10000, '2027-01-01')
      `,
    ).rejects.toThrow(/one_off belongs exclusively to adjustments/i);
  });

  it("rejects overlapping charge_schedules for the same tenancy + charge_type", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into charge_schedules (tenancy_id, charge_type_id, amount, valid_from)
          values (${tenancyId}, ${rentTypeId}, 250000, '2027-02-01')
        `;
        // Overlaps the open-ended schedule above — deferred, so this
        // succeeds within the transaction and only raises at COMMIT.
        await tx`
          insert into charge_schedules (tenancy_id, charge_type_id, amount, valid_from, valid_to)
          values (${tenancyId}, ${rentTypeId}, 260000, '2027-06-01', '2027-08-01')
        `;
      }),
    ).rejects.toThrow(/overlapping charge_schedule/i);
  });

  it("allows a valid fixed schedule (sanity check the rejections above aren't blocking everything)", async () => {
    const [row] = await sql`
      insert into charge_schedules (tenancy_id, charge_type_id, amount, valid_from)
      values (${tenancyId}, ${rentTypeId}, 250000, '2028-01-01')
      returning id
    `;
    expect(row.id).toBeTruthy();
    await sql`delete from charge_schedules where id = ${row.id}`;
  });
});

describe("meters: charge_type kind-gating", () => {
  it("rejects a meter referencing a fixed charge_type", async () => {
    await expect(
      sql`
        insert into meters (unit_id, charge_type_id, label, base_value, installed_at)
        values (${flatId}, ${rentTypeId}, 'BI Bad Meter', 0, '2026-01-01')
      `,
    ).rejects.toThrow(/metered or tracked_only/i);
  });

  it("allows a meter referencing a tracked_only charge_type", async () => {
    const [row] = await sql`
      insert into meters (unit_id, charge_type_id, label, base_value, installed_at)
      values (${flatId}, ${gasTypeId}, 'BI Gas Meter', 0, '2026-01-01')
      returning id
    `;
    meterIds.push(row.id);
    expect(row.id).toBeTruthy();
  });
});

describe("statements: issued immutability + payment-driven status", () => {
  // These wrap fixture + assertion in a single transaction that always
  // ends in a thrown error, so the whole thing rolls back — a real "issued"
  // statement's line items become permanently immutable (by design, never
  // hard-delete), so a committed fixture here could never be cleaned up
  // again. Same trick used for the payment-recompute test below, which
  // needs to commit intermediate state to read-your-own-write within the
  // transaction but still shouldn't leave anything behind afterward.

  it("rejects mutating total on a statement once it's no longer draft", async () => {
    await expect(
      sql.begin(async (tx) => {
        const [statement] = await tx`
          insert into statements (tenancy_id, period_month, status, total)
          values (${tenancyId}, '2026-04-01', 'draft', 0)
          returning id
        `;
        // draft -> issued is the one transition allowed to touch the
        // snapshot fields.
        await tx`
          update statements set status = 'issued', total = 1000, due_date = '2026-04-05'
          where id = ${statement.id}
        `;
        await tx`update statements set total = 2000 where id = ${statement.id}`;
      }),
    ).rejects.toThrow(/only status may change after issue/i);
  });

  it("rejects mutating a line item once the parent statement is issued", async () => {
    await expect(
      sql.begin(async (tx) => {
        const [statement] = await tx`
          insert into statements (tenancy_id, period_month, status, total)
          values (${tenancyId}, '2026-05-01', 'draft', 1000)
          returning id
        `;
        const [lineItem] = await tx`
          insert into statement_line_items (statement_id, charge_type_id, description, amount)
          values (${statement.id}, ${rentTypeId}, 'BI Rent', 1000)
          returning id
        `;
        await tx`update statements set status = 'issued' where id = ${statement.id}`;
        await tx`update statement_line_items set amount = 2000 where id = ${lineItem.id}`;
      }),
    ).rejects.toThrow(/line items are immutable/i);
  });

  it("rejects deleting a line item once the parent statement is issued", async () => {
    await expect(
      sql.begin(async (tx) => {
        const [statement] = await tx`
          insert into statements (tenancy_id, period_month, status, total)
          values (${tenancyId}, '2026-05-02', 'draft', 1000)
          returning id
        `;
        const [lineItem] = await tx`
          insert into statement_line_items (statement_id, charge_type_id, description, amount)
          values (${statement.id}, ${rentTypeId}, 'BI Rent', 1000)
          returning id
        `;
        await tx`update statements set status = 'issued' where id = ${statement.id}`;
        await tx`delete from statement_line_items where id = ${lineItem.id}`;
      }),
    ).rejects.toThrow(/line items are immutable/i);
  });

  it("recomputes statement status through partially_paid to paid as payments are recorded", async () => {
    const rollbackMarker = "__test_rollback__";
    await expect(
      sql.begin(async (tx) => {
        const [statement] = await tx`
          insert into statements (tenancy_id, period_month, status, total)
          values (${tenancyId}, '2026-06-01', 'issued', 1000)
          returning id
        `;

        await tx`
          insert into payments (statement_id, amount, paid_at, method, recorded_by)
          values (${statement.id}, 400, '2026-06-05', 'bank_transfer', ${personId})
        `;
        const [afterFirst] = await tx`select status from statements where id = ${statement.id}`;
        expect(afterFirst.status).toBe("partially_paid");

        await tx`
          insert into payments (statement_id, amount, paid_at, method, recorded_by)
          values (${statement.id}, 600, '2026-06-10', 'cash', ${personId})
        `;
        const [afterSecond] = await tx`select status from statements where id = ${statement.id}`;
        expect(afterSecond.status).toBe("paid");

        throw new Error(rollbackMarker);
      }),
    ).rejects.toThrow(rollbackMarker);
  });

  // M4's record-payment server action rejects a payment recorded against a
  // draft statement (application-level guard, not DB-enforced) precisely
  // because of what this test demonstrates: nothing at the DB layer
  // protects against it on its own. This inserts the payment the way raw
  // SQL would if that guard didn't exist, bypassing it on purpose, to
  // prove the statement is left permanently stuck at 'issued' — fully
  // paid but never recomputed to 'paid' — until some unrelated later
  // payment event happens to fire the trigger again.
  it("demonstrates why record-payment must reject draft statements: a payment against a draft isn't corrected when later issued", async () => {
    const rollbackMarker = "__test_rollback__";
    await expect(
      sql.begin(async (tx) => {
        const [statement] = await tx`
          insert into statements (tenancy_id, period_month, status, total)
          values (${tenancyId}, '2026-07-01', 'draft', 1000)
          returning id
        `;

        await tx`
          insert into payments (statement_id, amount, paid_at, method, recorded_by)
          values (${statement.id}, 1000, '2026-07-05', 'bank_transfer', ${personId})
        `;
        const [afterPayment] = await tx`select status from statements where id = ${statement.id}`;
        // trg_statements_recompute_status no-ops on draft, by design.
        expect(afterPayment.status).toBe("draft");

        // issue-statement's UPDATE only touches `statements`, never
        // `payments` — it does not fire trg_statements_recompute_status.
        await tx`update statements set status = 'issued' where id = ${statement.id}`;
        const [afterIssue] = await tx`select status from statements where id = ${statement.id}`;
        // Stuck at 'issued' despite already being fully paid — exactly
        // the bug record-payment's draft-guard exists to prevent.
        expect(afterIssue.status).toBe("issued");

        throw new Error(rollbackMarker);
      }),
    ).rejects.toThrow(rollbackMarker);
  });
});
