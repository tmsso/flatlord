import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL) — no
// local Postgres is available on this node. See project memory. Mirrors
// rls-tenancy-isolation.test.ts's asUser/adminSql pattern, extended to the
// Phase 1 M1 billing/meter tables.
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let houseId: string;
let flatAId: string;
let flatBId: string;
let personAId: string;
let personBId: string;
let userAId: string;
let userBId: string;
let tenancyAId: string;
let tenancyBId: string;
let meterAId: string;
let meterBId: string;
let chargeScheduleAId: string;
let adjustmentAId: string;
let statementAId: string;
let statementBId: string;
let lineItemAId: string;
let paymentAId: string;
let electricityAId: string;
// Owns houseId (root of flatA and flatB both) — verifies owner-scope RLS
// and the property_id denormalization triggers, which nothing else in
// this file exercises (the tenant assertions above key off unit_id/
// tenancy_id directly, never the denormalized property_id).
let ownerUserId: string;
let ownerPersonId: string;
// Owns nothing — verifies owner scoping actually restricts by ownership,
// not just by role.
let strangerOwnerUserId: string;
let strangerOwnerPersonId: string;

async function asUser(userId: string, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await adminSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    await fn(tx);
  });
}

beforeAll(async () => {
  houseId = randomUUID();
  await adminSql`
    insert into properties (id, root_property_id, parent_id, type, name, active)
    values (${houseId}, ${houseId}, null, 'house', 'RBI Test House', true)
  `;
  const [flatA] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RBI Test Flat A', 'whole', true)
    returning id
  `;
  const [flatB] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RBI Test Flat B', 'whole', true)
    returning id
  `;
  flatAId = flatA.id;
  flatBId = flatB.id;

  const [personA] = await adminSql`
    insert into persons (given_name, family_name) values ('RBI Test', 'Tenant A') returning id
  `;
  const [personB] = await adminSql`
    insert into persons (given_name, family_name) values ('RBI Test', 'Tenant B') returning id
  `;
  personAId = personA.id;
  personBId = personB.id;

  userAId = randomUUID();
  userBId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userAId})`;
  await adminSql`insert into auth.users (id) values (${userBId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userAId}, ${personAId}, 'tenant', 'hu')`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userBId}, ${personBId}, 'tenant', 'hu')`;

  const [tenancyA] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatAId}, ${personAId}, '2026-01-01', 'active')
    returning id
  `;
  const [tenancyB] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatBId}, ${personBId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyAId = tenancyA.id;
  tenancyBId = tenancyB.id;

  const [electricityA] = await adminSql`
    insert into charge_types (unit_id, kind, name, unit)
    values (${flatAId}, 'metered', 'RBI Electricity A', 'kWh') returning id
  `;
  const [rentA] = await adminSql`
    insert into charge_types (unit_id, kind, name) values (${flatAId}, 'fixed', 'RBI Rent A') returning id
  `;
  const [electricityB] = await adminSql`
    insert into charge_types (unit_id, kind, name, unit)
    values (${flatBId}, 'metered', 'RBI Electricity B', 'kWh') returning id
  `;

  const [meterA] = await adminSql`
    insert into meters (unit_id, charge_type_id, label, base_value, installed_at)
    values (${flatAId}, ${electricityA.id}, 'RBI Meter A', 0, '2026-01-01') returning id
  `;
  const [meterB] = await adminSql`
    insert into meters (unit_id, charge_type_id, label, base_value, installed_at)
    values (${flatBId}, ${electricityB.id}, 'RBI Meter B', 0, '2026-01-01') returning id
  `;
  meterAId = meterA.id;
  meterBId = meterB.id;
  electricityAId = electricityA.id;

  await adminSql`
    insert into meter_readings (meter_id, tenancy_id, reading_date, entered_value, entered_by)
    values (${meterAId}, ${tenancyAId}, '2026-02-01', 100, ${personAId})
  `;

  const [scheduleA] = await adminSql`
    insert into charge_schedules (tenancy_id, charge_type_id, amount, valid_from)
    values (${tenancyAId}, ${rentA.id}, 250000, '2026-01-01') returning id
  `;
  chargeScheduleAId = scheduleA.id;

  const [adjustmentA] = await adminSql`
    insert into adjustments (tenancy_id, charge_type_id, amount, reason, target_month, created_by)
    values (${tenancyAId}, ${rentA.id}, -5000, 'RBI test credit', '2026-01-01', ${personAId}) returning id
  `;
  adjustmentAId = adjustmentA.id;

  // Deliberately left as 'draft' (not 'issued') — RLS visibility doesn't
  // depend on status, and 'issued' would permanently freeze the line item
  // below (trg_statement_line_items_prevent_issued_mutation), making this
  // fixture impossible to clean up in afterAll.
  const [statementA] = await adminSql`
    insert into statements (tenancy_id, period_month, status, total)
    values (${tenancyAId}, '2026-01-01', 'draft', 250000) returning id
  `;
  const [statementB] = await adminSql`
    insert into statements (tenancy_id, period_month, status, total)
    values (${tenancyBId}, '2026-01-01', 'draft', 250000) returning id
  `;
  statementAId = statementA.id;
  statementBId = statementB.id;

  const [lineItemA] = await adminSql`
    insert into statement_line_items (statement_id, charge_type_id, description, amount)
    values (${statementAId}, ${rentA.id}, 'RBI Rent', 250000) returning id
  `;
  lineItemAId = lineItemA.id;

  const [paymentA] = await adminSql`
    insert into payments (statement_id, amount, paid_at, method, recorded_by)
    values (${statementAId}, 250000, '2026-01-05', 'bank_transfer', ${personAId}) returning id
  `;
  paymentAId = paymentA.id;

  // Owner of houseId (root of both flatA and flatB) — exercises
  // owner_scope_* policies and the property_id denorm triggers.
  const [ownerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RBI Test', 'Owner') returning id
  `;
  ownerPersonId = ownerPerson.id;
  ownerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${ownerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${ownerUserId}, ${ownerPersonId}, 'owner', 'hu')`;
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${ownerPersonId}, 100)`;

  // Owns nothing — negative control for owner scoping.
  const [strangerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RBI Test', 'Stranger Owner') returning id
  `;
  strangerOwnerPersonId = strangerPerson.id;
  strangerOwnerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${strangerOwnerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${strangerOwnerUserId}, ${strangerOwnerPersonId}, 'owner', 'hu')`;
});

afterAll(async () => {
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from persons where id in (${ownerPersonId}, ${strangerOwnerPersonId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from payments where id = ${paymentAId}`;
  await adminSql`delete from statement_line_items where id = ${lineItemAId}`;
  await adminSql`delete from statements where id in (${statementAId}, ${statementBId})`;
  await adminSql`delete from adjustments where id = ${adjustmentAId}`;
  await adminSql`delete from charge_schedules where id = ${chargeScheduleAId}`;
  await adminSql`delete from meter_readings where meter_id in (${meterAId}, ${meterBId})`;
  await adminSql`delete from meters where id in (${meterAId}, ${meterBId})`;
  await adminSql`delete from charge_types where unit_id in (${flatAId}, ${flatBId})`;
  await adminSql`delete from tenancies where id in (${tenancyAId}, ${tenancyBId})`;
  await adminSql`delete from profiles where id in (${userAId}, ${userBId})`;
  await adminSql`delete from persons where id in (${personAId}, ${personBId})`;
  await adminSql`delete from properties where name like 'RBI Test%'`;
  await adminSql`delete from auth.users where id in (${userAId}, ${userBId})`;
  await adminSql.end();
});

describe("RLS: billing/meter tenant isolation", () => {
  it("a tenant sees their own meter, not another tenant's", async () => {
    await asUser(userAId, async (tx) => {
      const own = await tx`select id from meters where id = ${meterAId}`;
      expect(own).toHaveLength(1);
      const other = await tx`select id from meters where id = ${meterBId}`;
      expect(other).toHaveLength(0);
    });
  });

  it("a tenant sees their own meter readings, not another tenant's", async () => {
    await asUser(userAId, async (tx) => {
      const rows = await tx`select id from meter_readings where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(1);
    });
    await asUser(userBId, async (tx) => {
      const rows = await tx`select id from meter_readings where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("a tenant can submit a meter reading for their own active tenancy", async () => {
    let insertedId: string | undefined;
    await asUser(userAId, async (tx) => {
      const [row] = await tx`
        insert into meter_readings (meter_id, tenancy_id, reading_date, entered_value, entered_by)
        values (${meterAId}, ${tenancyAId}, '2026-03-01', 150, ${personAId})
        returning id
      `;
      insertedId = row.id;
    });
    expect(insertedId).toBeTruthy();
    await adminSql`delete from meter_readings where id = ${insertedId!}`;
  });

  it("a tenant cannot submit a meter reading against another tenant's tenancy", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into meter_readings (meter_id, tenancy_id, reading_date, entered_value, entered_by)
          values (${meterBId}, ${tenancyBId}, '2026-03-01', 150, ${personAId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("a tenant cannot see charge_schedules at all, even their own tenancy's", async () => {
    await asUser(userAId, async (tx) => {
      const rows = await tx`select id from charge_schedules where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("a tenant cannot see adjustments at all, even their own tenancy's", async () => {
    await asUser(userAId, async (tx) => {
      const rows = await tx`select id from adjustments where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("a tenant sees their own statements and line items, not another tenant's", async () => {
    await asUser(userAId, async (tx) => {
      const own = await tx`select id from statements where id = ${statementAId}`;
      expect(own).toHaveLength(1);
      const other = await tx`select id from statements where id = ${statementBId}`;
      expect(other).toHaveLength(0);

      const ownLineItems = await tx`select id from statement_line_items where statement_id = ${statementAId}`;
      expect(ownLineItems).toHaveLength(1);
    });
  });

  it("a tenant sees their own payments, not another tenant's", async () => {
    await asUser(userAId, async (tx) => {
      const rows = await tx`select id from payments where statement_id = ${statementAId}`;
      expect(rows).toHaveLength(1);
    });
    await asUser(userBId, async (tx) => {
      const rows = await tx`select id from payments where statement_id = ${statementAId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("a tenant cannot create a statement", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into statements (tenancy_id, period_month, status, total)
          values (${tenancyAId}, '2026-07-01', 'draft', 0)
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("a tenant cannot record a payment", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into payments (statement_id, amount, paid_at, method, recorded_by)
          values (${statementAId}, 1000, '2026-07-05', 'cash', ${personAId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  // The tenant assertions above key off unit_id/tenancy_id directly, never
  // the denormalized property_id — so they don't exercise owner_scope_*
  // policies or the *_set_property_id triggers at all. These do.
  it("an owner sees billing rows for both units under their property, across the denormalized property_id chain", async () => {
    await asUser(ownerUserId, async (tx) => {
      const chargeTypes = await tx`select id from charge_types where id = ${electricityAId}`;
      expect(chargeTypes).toHaveLength(1);

      const meters = await tx`select id from meters where id in (${meterAId}, ${meterBId})`;
      expect(meters.map((r) => r.id).sort()).toEqual([meterAId, meterBId].sort());

      const schedules = await tx`select id from charge_schedules where id = ${chargeScheduleAId}`;
      expect(schedules).toHaveLength(1);

      const adjustmentsRows = await tx`select id from adjustments where id = ${adjustmentAId}`;
      expect(adjustmentsRows).toHaveLength(1);

      const statements = await tx`select id from statements where id in (${statementAId}, ${statementBId})`;
      expect(statements.map((r) => r.id).sort()).toEqual([statementAId, statementBId].sort());

      const payments = await tx`select id from payments where id = ${paymentAId}`;
      expect(payments).toHaveLength(1);
    });
  });

  it("an owner can create a charge_type for a property they own (exercises charge_types_set_property_id)", async () => {
    let insertedId: string | undefined;
    await asUser(ownerUserId, async (tx) => {
      const [row] = await tx`
        insert into charge_types (unit_id, kind, name) values (${flatAId}, 'fixed', 'RBI Common Cost')
        returning id
      `;
      insertedId = row.id;
    });
    expect(insertedId).toBeTruthy();
    // property_id should have been trigger-populated to the flat's root
    // (houseId), not left at its column default.
    const [row] = await adminSql`select property_id from charge_types where id = ${insertedId!}`;
    expect(row.property_id).toBe(houseId);
    await adminSql`delete from charge_types where id = ${insertedId!}`;
  });

  it("an owner who owns nothing sees none of these billing rows", async () => {
    await asUser(strangerOwnerUserId, async (tx) => {
      expect(await tx`select id from charge_types where id = ${electricityAId}`).toHaveLength(0);
      expect(await tx`select id from meters where id = ${meterAId}`).toHaveLength(0);
      expect(await tx`select id from charge_schedules where id = ${chargeScheduleAId}`).toHaveLength(0);
      expect(await tx`select id from adjustments where id = ${adjustmentAId}`).toHaveLength(0);
      expect(await tx`select id from statements where id = ${statementAId}`).toHaveLength(0);
      expect(await tx`select id from payments where id = ${paymentAId}`).toHaveLength(0);
    });
  });
});
