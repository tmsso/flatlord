import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real cloud Supabase project (SUPABASE_DB_URL) — no
// local Postgres is available on this node. Mirrors the asUser/adminSql
// pattern in rls-contracts-isolation.test.ts, extended to the Phase 2
// deposit_transactions table + policies (migration 0016).
const adminSql = postgres(process.env.SUPABASE_DB_URL!, { prepare: false });

let houseId: string;
let flatAId: string;
let personAId: string;
let userAId: string;
let tenancyAId: string;
let paidTransactionAId: string;
let appliedTransactionAId: string;
// Owns houseId — exercises owner_scope_deposit_transactions /
// owner_insert_deposit_transactions.
let ownerUserId: string;
let ownerPersonId: string;
// Owns nothing — negative control for owner scoping.
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
    values (${houseId}, ${houseId}, null, 'house', 'RDI Test House', true)
  `;
  const [flatA] = await adminSql`
    insert into properties (root_property_id, parent_id, type, name, letting_mode, active)
    values (${houseId}, ${houseId}, 'flat', 'RDI Test Flat A', 'whole', true)
    returning id
  `;
  flatAId = flatA.id;

  const [personA] = await adminSql`
    insert into persons (given_name, family_name) values ('RDI Test', 'Tenant A') returning id
  `;
  personAId = personA.id;
  userAId = randomUUID();
  await adminSql`insert into auth.users (id) values (${userAId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${userAId}, ${personAId}, 'tenant', 'hu')`;

  const [tenancyA] = await adminSql`
    insert into tenancies (unit_id, primary_tenant_id, term_start, status)
    values (${flatAId}, ${personAId}, '2026-01-01', 'active')
    returning id
  `;
  tenancyAId = tenancyA.id;

  const [ownerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RDI Test', 'Owner') returning id
  `;
  ownerPersonId = ownerPerson.id;
  ownerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${ownerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${ownerUserId}, ${ownerPersonId}, 'owner', 'hu')`;
  await adminSql`insert into property_ownership (property_id, person_id, percentage) values (${houseId}, ${ownerPersonId}, 100)`;

  const [paidTransaction] = await adminSql`
    insert into deposit_transactions (tenancy_id, type, amount, transaction_date, recorded_by)
    values (${tenancyAId}, 'paid', 440000, '2024-09-01', ${ownerPersonId})
    returning id
  `;
  paidTransactionAId = paidTransaction.id;

  const [appliedTransaction] = await adminSql`
    insert into deposit_transactions (tenancy_id, type, amount, transaction_date, recorded_by)
    values (${tenancyAId}, 'applied', 220000, '2024-09-01', ${ownerPersonId})
    returning id
  `;
  appliedTransactionAId = appliedTransaction.id;

  const [strangerPerson] = await adminSql`
    insert into persons (given_name, family_name) values ('RDI Test', 'Stranger Owner') returning id
  `;
  strangerOwnerPersonId = strangerPerson.id;
  strangerOwnerUserId = randomUUID();
  await adminSql`insert into auth.users (id) values (${strangerOwnerUserId})`;
  await adminSql`insert into profiles (id, person_id, role, locale) values (${strangerOwnerUserId}, ${strangerOwnerPersonId}, 'owner', 'hu')`;
});

afterAll(async () => {
  await adminSql`delete from deposit_transactions where tenancy_id = ${tenancyAId}`;
  await adminSql`delete from property_ownership where property_id = ${houseId}`;
  await adminSql`delete from profiles where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from persons where id in (${ownerPersonId}, ${strangerOwnerPersonId})`;
  await adminSql`delete from auth.users where id in (${ownerUserId}, ${strangerOwnerUserId})`;
  await adminSql`delete from tenancies where id = ${tenancyAId}`;
  await adminSql`delete from profiles where id = ${userAId}`;
  await adminSql`delete from persons where id = ${personAId}`;
  await adminSql`delete from properties where name like 'RDI Test%'`;
  await adminSql`delete from auth.users where id = ${userAId}`;
  await adminSql.end();
});

describe("RLS: deposit_transactions isolation (migration 0016)", () => {
  it("a tenant sees their own tenancy's deposit transactions", async () => {
    await asUser(userAId, async (tx) => {
      const rows = await tx`select id, type from deposit_transactions where tenancy_id = ${tenancyAId} order by type`;
      expect(rows.map((r) => r.id).sort()).toEqual([appliedTransactionAId, paidTransactionAId].sort());
    });
  });

  it("a tenant cannot insert a deposit transaction", async () => {
    await expect(
      asUser(userAId, async (tx) => {
        await tx`
          insert into deposit_transactions (tenancy_id, type, amount, transaction_date, recorded_by)
          values (${tenancyAId}, 'paid', 10000, '2026-01-01', ${ownerPersonId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("a tenant's update to a deposit transaction silently affects no rows (no tenant UPDATE policy)", async () => {
    await asUser(userAId, async (tx) => {
      const result = await tx`update deposit_transactions set note = 'tampered' where id = ${paidTransactionAId}`;
      expect(result.count).toBe(0);
    });
    const [after] = await adminSql`select note from deposit_transactions where id = ${paidTransactionAId}`;
    expect(after.note).toBeNull();
  });

  it("the owning owner sees all transactions; a stranger owner sees none", async () => {
    await asUser(ownerUserId, async (tx) => {
      const rows = await tx`select id from deposit_transactions where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(2);
    });
    await asUser(strangerOwnerUserId, async (tx) => {
      const rows = await tx`select id from deposit_transactions where tenancy_id = ${tenancyAId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("the owning owner can insert a deposit transaction on their own property", async () => {
    let insertedId: string | undefined;
    await asUser(ownerUserId, async (tx) => {
      const [row] = await tx`
        insert into deposit_transactions (tenancy_id, type, amount, transaction_date, recorded_by)
        values (${tenancyAId}, 'refunded', 220000, '2026-06-01', ${ownerPersonId})
        returning id
      `;
      insertedId = row.id;
    });
    expect(insertedId).toBeTruthy();
    const [after] = await adminSql`select amount from deposit_transactions where id = ${insertedId!}`;
    expect(Number(after.amount)).toBe(220000);
    await adminSql`delete from deposit_transactions where id = ${insertedId!}`;
  });

  // No owner UPDATE policy exists either (owner_scope_deposit_transactions
  // is SELECT-only) — real financial history is append-only for owner and
  // tenant alike, a correction is a new offsetting row, never an edit.
  it("even the owning owner's update to a deposit transaction silently affects no rows", async () => {
    await asUser(ownerUserId, async (tx) => {
      const result = await tx`update deposit_transactions set amount = 1 where id = ${paidTransactionAId}`;
      expect(result.count).toBe(0);
    });
    const [after] = await adminSql`select amount from deposit_transactions where id = ${paidTransactionAId}`;
    expect(Number(after.amount)).toBe(440000);
  });

  it("a stranger owner cannot insert a deposit transaction on a tenancy they don't own", async () => {
    await expect(
      asUser(strangerOwnerUserId, async (tx) => {
        await tx`
          insert into deposit_transactions (tenancy_id, type, amount, transaction_date, recorded_by)
          values (${tenancyAId}, 'paid', 10000, '2026-01-01', ${strangerOwnerPersonId})
        `;
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("amount must be non-negative (deposit_transactions_amount_nonnegative)", async () => {
    await expect(
      adminSql`
        insert into deposit_transactions (tenancy_id, type, amount, transaction_date, recorded_by)
        values (${tenancyAId}, 'paid', -1, '2026-01-01', ${ownerPersonId})
      `,
    ).rejects.toThrow(/check constraint|violates/i);
  });

  it("property_id is trigger-set from the tenancy's root property, never trusted from app input", async () => {
    const [row] = await adminSql`select property_id from deposit_transactions where id = ${paidTransactionAId}`;
    expect(row.property_id).toBe(houseId);
  });
});
